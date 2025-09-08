#  Speech Transcriber (Backend)

A **Node.js + Express** backend API for the Speech Transcriber application.  
Handles authentication, file uploads, database management, and communication with the frontend.

---

##  Features
-  User authentication with **JWT** and **bcryptjs**
-  File upload handling using **Multer**
-  Cross-origin support with **CORS**
-  Database integration with **MongoDB + Mongoose**
-  Environment variable management using **dotenv**
-  REST API endpoints for speech transcription and history management

---

##  Tech Stack
- **Runtime**: Node.js  
- **Framework**: Express 5  
- **Database**: MongoDB (via Mongoose)  
- **Auth**: JWT + bcryptjs  
- **File Handling**: Multer  
- **Other Tools**: Axios, dotenv, CORS  

---

##  Installation & Setup

Clone the repository:
```bash
git clone https://github.com/your-username/backend-speech-transcriber.git
cd backend-speech-transcriber
```

Install dependencies:
```bash
npm install
```

Create a .env file in the root directory:
```bash
MONGO_URI=your_mongodb_connection_string
PORT=5000
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
```

Start the development server:
```bash
npm run dev
```