const admin = require("firebase-admin");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { OpenAIApi, Configuration } = require("openai");
const functions = require("firebase-functions");
const axios = require("axios");

// Initialize Firebase
// Retrieve secrets from Firebase environment configuration
// const serviceAccount = functions.config().serviceaccount.key;
const serviceAccount = require("./quizwizz-9a431-firebase-adminsdk-gznry-2d7eab4793.json");
// const apiKey = functions.config().openai.key;

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Initialize OpenAI
const configuration = new Configuration({
    organization: "org-3RXh4TPeEq54RD3fXTUXs9V9",
    apiKey: "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",
});
const openai = new OpenAIApi(configuration);

const insertSpaces = (text) => {
    return text
        .replace(/([a-z])([A-Z])/g, "$1 $2") // Insert space between lowercase and uppercase: "wordNextword" -> "word Nextword"
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2"); // Insert space before a capital letter followed by lowercase letters: "WordNext" -> "Word Next"
};

const extractContentFromDocument = async (url) => {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const content = response.data;

    // Extract the file extension, ensuring we ignore query parameters
    const extension = url.split("?")[0].split(".").pop().toLowerCase();

    if (extension === "pdf") {
        const pdfData = await pdf(content);
        const extractedText = pdfData.text.replace(/\n/g, " "); // Replacing newlines with spaces
        let data = insertSpaces(extractedText); // Use the helper function to insert spaces
        // console.log("pdfdata", data);
        return data;
    } else if (extension === "docx") {
        const { value } = await mammoth.extractRawText({ buffer: content });
        return value;
    } else if (extension === "txt") {
        return content.toString();
    }
    throw new Error("Unsupported file format");
};

async function getPreviousQuestionsForUser(userId, chapterId) {
    const questions = [];

    // Query the Firestore database for the user's generated questions for the specific chapter.
    const questionsSnapshot = await db
        .collection("Users")
        .doc(userId)
        .collection("GeneratedQuestions")
        .where("ChapterId", "==", chapterId)
        .get();

    // Extract the questions from the snapshot and push them into the questions array.
    questionsSnapshot.forEach((doc) => {
        const data = doc.data();
        questions.push(data.Question);
    });

    return questions;
}

function estimateTokens(text) {
    // Split the text by spaces and count the elements for a very basic token estimate.
    return text.split(/\s+/).length;
}


const TOKEN_LIMIT = 2800;

exports.generateTest = functions.https.onCall(async (data, context) => {
    const { userId, grade, subject, chapter, documentUrl } = data;

    // Validate request body
    if (!userId || !grade || !subject || !chapter) {
        console.error("Missing required fields.");
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
        console.log('Extracting content from document...');
        let documentContent;
        if (documentUrl) {
            documentContent = await extractContentFromDocument(documentUrl);
        }
        console.log('Document content extracted.', documentContent);

        const previousQuestions = await getPreviousQuestionsForUser(userId, chapter);

        let truncatedContent;
        if (documentUrl) {
            truncatedContent = documentContent.substring(0, TOKEN_LIMIT)
            console.log('TrancatedContent extracted.', truncatedContent);
        }

        // const totalPreviousQuestions = previousQuestions.join(" "); // Combine all previous questions into one string

        // const totalTokenEstimate = estimateTokens(truncatedContent) + estimateTokens(totalPreviousQuestions);

        // console.log(`Estimated total tokens for content and previous questions: ${totalTokenEstimate}`);

        // Generate MCQ question
        const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that generates MCQ questions in arabic based on the given grade, subject, and chapter. Avoid generating questions similar to these:' + previousQuestions.join("\n")
                },
                {
                    role: 'user',
                    content: `Generate a question for grade ${grade}, subject ${subject}, chapter ${chapter} with the content: "${truncatedContent}"`
                    // content: `Generate a question for grade ${grade}, subject ${subject}, chapter ${chapter}`
                }
            ],
            temperature: 0.7,
            max_tokens: 150
        });

        console.log('Question generation status:', response.status);

        const question = response.data.choices[0].message.content.trim();

        console.log('Saving question to Firestore...');
        const testDoc = db.collection('Tests').doc();
        await testDoc.set({
            userId,
            subjectId: subject,
            chapterId: chapter,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            questions: [question],
            answers: [],
            score: 0
        });

        // Save question hash to Firestore under GeneratedQuestions for the user with the chapter ID.
        await db.collection('Users')
            .doc(userId)
            .collection('GeneratedQuestions')
            .add({
                Question: question,
                ChapterId: chapter
            });
        console.log('Question saved.');

        return { testId: testDoc.id, question };

    } catch (error) {
        console.error("Error:", error);
        throw new functions.https.HttpsError('unknown', error.toString());
    }
});


exports.submitAnswer = functions.https.onCall(async (data, context) => {
    const { testId, answer } = data;

    // Validate request body
    if (!testId || !answer) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Missing required fields"
        );
    }

    try {
        // Get the test document from Firestore
        const testDoc = db.collection("Tests").doc(testId);
        const test = await testDoc.get();

        if (!test.exists) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Test not found!"
            );
        }

        // Get the correct answer from the OpenAI API
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a helpful assistant that validates answers to MCQ questions.",
                },
                {
                    role: "user",
                    // content: `Reply "yes" or "no", Is Option "${answer}" the correct answer to the question "${test.data().questions[0]}"?`,
                    content: `Here is the question and answer options: "${test.data().questions[0]
                        }". Is "${answer}" the correct answer? Answer only with "yes" or "no".`,
                },
            ],
            temperature: 1,
            max_tokens: 50,
        });

        const apiResponse = response.data.choices[0].message.content.trim();
        console.log(apiResponse);
        const lowerCaseResponse = apiResponse.toLowerCase();
        // Yes this is correct answer for this question what is netwons law
        const isCorrect =
            lowerCaseResponse.startsWith("yes") ||
            lowerCaseResponse.split(" ").includes("yes");

        // Increment correct or wrong count based on the answer
        let updateField = isCorrect ? "CorrectCount" : "WrongCount";

        // Update the test document with the user's answer and whether it was correct
        await testDoc.update({
            answers: admin.firestore.FieldValue.arrayUnion({ answer, isCorrect }),
            score: admin.firestore.FieldValue.increment(isCorrect ? 1 : 0),
        });

        // Update the user score in the Users collection if the answer is correct
        if (isCorrect) {
            const userDoc = db.collection("Users").doc(test.data().userId);
            await userDoc.update({
                score: admin.firestore.FieldValue.increment(1),
            });
        }

        // Get user's score document or create if it doesn't exist
        const scoreDoc = db
            .collection("Users")
            .doc(test.data().userId)
            .collection("Scores")
            .doc(testId);
        const scoreData = await scoreDoc.get();

        // Retrieve subjectId and chapterId from the test document data
        const { subjectId, chapterId } = test.data();

        if (!scoreData.exists) {
            // If score document doesn't exist, create a new one
            await scoreDoc.set({
                subjectIdID: subjectId,
                ChapterID: chapterId,
                CorrectCount: isCorrect ? 1 : 0,
                WrongCount: !isCorrect ? 1 : 0,
                AttemptedCount: 1,
            });
        } else {
            // If score document exists, update the counts and increase the AttemptedCount
            await scoreDoc.update({
                [updateField]: admin.firestore.FieldValue.increment(1),
                AttemptedCount: admin.firestore.FieldValue.increment(1),
            });
        }

        return { isCorrect };
    } catch (error) {
        console.error(error);
        throw new functions.https.HttpsError("unknown", error.toString());
    }
});

exports.explainAnswer = functions.https.onCall(async (data, context) => {
    const { testId } = data;

    // Validate request body
    if (!testId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Missing required fields"
        );
    }
    try {
        // Get the test document from Firestore
        const testDoc = db.collection("Tests").doc(testId);
        const test = await testDoc.get();

        if (!test.exists) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Test not found"
            );
        }

        // Get the explanation from the OpenAI API
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a helpful assistant that provides explanations for MCQ questions.",
                },
                {
                    role: "user",
                    content: `Please explain the answer to the question "${test.data().questions[0]
                        }"`,
                },
            ],
            temperature: 0.7,
            max_tokens: 200,
        });

        const explanation = response.data.choices[0].message.content.trim();

        return { explanation };
    } catch (error) {
        console.error(error);
        throw new functions.https.HttpsError("unknown", error.toString());
    }
});
