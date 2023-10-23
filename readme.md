# QuizWizz GPT API

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![Powered by GPT-3.5 Turbo](https://img.shields.io/badge/Powered%20by-GPT--3.5%20Turbo-blueviolet?style=for-the-badge&logo=openai)

QuizWizz GPT API leverages OpenAI's GPT-3.5 Turbo model to generate, validate, and explain MCQ questions based on provided content.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Licensing](#licensing)

## 🚀 Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/ankitRay1/QuizWizz-Api.git
   ```

2. Navigate into the directory:
   ```bash
   cd QuizWizz-Api
   ```
3. Install dependencies:
   ```bash
   cd functions && npm install
   ```
4. Run the api:
   ```bash
   npm run serve
   ```

## Usage

1. Initialize Firebase and OpenAI API using provided configuration.

2. Use the Firebase cloud functions to generate, validate, and explain MCQ questions.

## API Endpoints

1. generateTest: Generates an MCQ question based on the provided document URL and the user's previous questions.

2. submitAnswer: Validates a user's answer to a specific test question.

3. explainAnswer: Provides an explanation for a specific test question's answer.

## 🙌 Contribute

Contributions are welcome! Feel free to open an issue or submit a pull request.

## 📜 License

QuizWizz is MIT licensed.
