const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Secret key from Vercel environment variables or fallback
const SECRET_KEY = process.env.JWT_SECRET || "vercel_default_production_key_mock_test";

// In-memory data structures
const USERS = [];
const SESSIONS = new Map();

// Test questions: correctOption is kept server-side only
const TEST_BANK = {
  "test-101": {
    id: "test-101",
    title: "Computer Science Assessment",
    durationMinutes: 5,
    questions: [
      {
        id: "q1",
        text: "What is the time complexity of binary search in the worst case?",
        options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
        correctOption: 1
      },
      {
        id: "q2",
        text: "Which protocol is used for secure communication over the web?",
        options: ["HTTP", "FTP", "HTTPS", "SMTP"],
        correctOption: 2
      },
      {
        id: "q3",
        text: "Which data structure follows the LIFO principle?",
        options: ["Queue", "Stack", "Array", "Linked List"],
        correctOption: 1
      }
    ]
  }
};

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

// 1. User Registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

  const existing = USERS.find(u => u.username === username);
  if (existing) return res.status(400).json({ error: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: `user_${Date.now()}`, username, password: hashedPassword };
  USERS.push(user);

  res.status(201).json({ message: "User registered successfully" });
});

// 2. User Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '2h' });
  res.json({ token, username: user.username });
});

// 3. Start Test
app.post('/api/test/start', authenticateToken, (req, res) => {
  const { testId } = req.body;
  const test = TEST_BANK[testId];
  if (!test) return res.status(404).json({ error: "Test not found" });

  const existingSession = SESSIONS.get(req.user.id);
  if (existingSession && existingSession.testId === testId && existingSession.completed) {
    return res.status(403).json({ error: "Test already completed" });
  }

  const startTime = Date.now();
  const expiresAt = startTime + (test.durationMinutes * 60 * 1000) + 30000; // 30-sec network buffer

  SESSIONS.set(req.user.id, {
    testId,
    startTime,
    expiresAt,
    completed: false
  });

  // Strip answers before sending to client
  const clientQuestions = test.questions.map(({ id, text, options }) => ({
    id,
    text,
    options
  }));

  res.json({
    testId: test.id,
    title: test.title,
    durationMinutes: test.durationMinutes,
    expiresAt,
    questions: clientQuestions
  });
});

// 4. Submit Test
app.post('/api/test/submit', authenticateToken, (req, res) => {
  const { testId, answers } = req.body;
  const session = SESSIONS.get(req.user.id);

  if (!session || session.testId !== testId) {
    return res.status(400).json({ error: "No active session for this test" });
  }

  if (session.completed) {
    return res.status(400).json({ error: "Test already submitted" });
  }

  if (Date.now() > session.expiresAt) {
    session.completed = true;
    return res.status(403).json({ error: "Test submission rejected: Time expired" });
  }

  const test = TEST_BANK[testId];
  let score = 0;
  const total = test.questions.length;
  const review = [];

  test.questions.forEach(q => {
    const userAnswer = answers ? answers[q.id] : null;
    const isCorrect = userAnswer === q.correctOption;
    if (isCorrect) score++;

    review.push({
      id: q.id,
      text: q.text,
      userAnswer,
      correctOption: q.correctOption,
      isCorrect
    });
  });

  session.completed = true;

  res.json({
    score,
    total,
    percentage: ((score / total) * 100).toFixed(2),
    review
  });
});

module.exports = app;
