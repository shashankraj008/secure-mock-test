const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = process.env.JWT_SECRET || "mock_test_secret_2026";
const ADMIN_API_KEY = process.env.ADMIN_KEY || "admin_secret_key_123";

// In-Memory Data (Replace with PostgreSQL/Supabase for production persistence)
const USERS = [];
const SESSIONS = new Map();
const USER_HISTORY = new Map(); // userId -> Array of attempt records

// Master Question Bank
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
        correctOption: 1,
        explanation: "Binary search cuts the search space in half with each iteration, giving logarithmic time."
      },
      {
        id: "q2",
        text: "Which protocol is used for secure communication over the web?",
        options: ["HTTP", "FTP", "HTTPS", "SMTP"],
        correctOption: 2,
        explanation: "HTTPS encrypts normal HTTP communication over TLS/SSL."
      }
    ]
  }
};

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

// 1. Auth
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  if (USERS.find(u => u.username === username)) return res.status(400).json({ error: "User exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: `user_${Date.now()}`, username, password: hashedPassword };
  USERS.push(user);
  res.status(201).json({ message: "Registered successfully" });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '2h' });
  res.json({ token, username: user.username });
});

// 2. Mock Test Operations: List Available Tests
app.get('/api/tests', authenticateToken, (req, res) => {
  const catalog = Object.values(TEST_BANK).map(t => ({
    id: t.id,
    title: t.title,
    durationMinutes: t.durationMinutes,
    totalQuestions: t.questions.length
  }));
  res.json(catalog);
});

// 3. Admin: Add New Mock Tests
app.post('/api/admin/tests', (req, res) => {
  const clientKey = req.headers['x-admin-key'];
  if (clientKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Unauthorized: Invalid admin key" });
  }

  const { id, title, durationMinutes, questions } = req.body;
  if (!id || !title || !questions || !Array.isArray(questions)) {
    return res.status(400).json({ error: "Malformed test payload" });
  }

  TEST_BANK[id] = { id, title, durationMinutes: durationMinutes || 10, questions };
  res.status(201).json({ message: "Test created successfully", testId: id });
});

// 4. Start Test
app.post('/api/test/start', authenticateToken, (req, res) => {
  const { testId } = req.body;
  const test = TEST_BANK[testId];
  if (!test) return res.status(404).json({ error: "Test not found" });

  const startTime = Date.now();
  const expiresAt = startTime + (test.durationMinutes * 60 * 1000) + 30000;

  SESSIONS.set(`${req.user.id}_${testId}`, {
    testId,
    startTime,
    expiresAt,
    completed: false
  });

  const clientQuestions = test.questions.map(({ id, text, options }) => ({ id, text, options }));
  res.json({ testId: test.id, title: test.title, expiresAt, questions: clientQuestions });
});

// 5. Submit Test & Store Solution Record
app.post('/api/test/submit', authenticateToken, (req, res) => {
  const { testId, answers } = req.body;
  const sessionKey = `${req.user.id}_${testId}`;
  const session = SESSIONS.get(sessionKey);

  if (!session || session.completed) {
    return res.status(400).json({ error: "Invalid or already submitted session" });
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
      question: q.text,
      options: q.options,
      selectedAnswer: userAnswer !== null ? q.options[userAnswer] : "Skipped",
      correctAnswer: q.options[q.correctOption],
      isCorrect,
      explanation: q.explanation || "No explanation provided."
    });
  });

  session.completed = true;

  // Persist attempt history
  const attemptRecord = {
    testId,
    testTitle: test.title,
    submittedAt: new Date().toISOString(),
    score,
    total,
    percentage: ((score / total) * 100).toFixed(1),
    review
  };

  const history = USER_HISTORY.get(req.user.id) || [];
  history.push(attemptRecord);
  USER_HISTORY.set(req.user.id, history);

  res.json(attemptRecord);
});

// 6. Student Progress / Past Attempts
app.get('/api/user/progress', authenticateToken, (req, res) => {
  const history = USER_HISTORY.get(req.user.id) || [];
  res.json(history);
});

module.exports = app;
