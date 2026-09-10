// --- ADMIN CRUD ROUTES ---

// 1. Get all tests with full answer keys and explanations
app.get('/api/admin/tests', (req, res) => {
  const clientKey = req.headers['x-admin-key'];
  if (clientKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Unauthorized: Invalid admin key" });
  }
  res.json(Object.values(TEST_BANK));
});

// 2. Create a new test
app.post('/api/admin/tests', (req, res) => {
  const clientKey = req.headers['x-admin-key'];
  if (clientKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Unauthorized: Invalid admin key" });
  }

  const { id, title, durationMinutes, questions } = req.body;
  if (!id || !title || !Array.isArray(questions)) {
    return res.status(400).json({ error: "Malformed test payload" });
  }

  TEST_BANK[id] = { id, title, durationMinutes: Number(durationMinutes) || 10, questions };
  res.status(201).json({ message: "Test created", test: TEST_BANK[id] });
});

// 3. Update an existing test (questions, correct options, explanations, duration)
app.put('/api/admin/tests/:id', (req, res) => {
  const clientKey = req.headers['x-admin-key'];
  if (clientKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Unauthorized: Invalid admin key" });
  }

  const { id } = req.params;
  if (!TEST_BANK[id]) {
    return res.status(404).json({ error: "Test ID does not exist" });
  }

  const { title, durationMinutes, questions } = req.body;
  TEST_BANK[id] = {
    id,
    title: title || TEST_BANK[id].title,
    durationMinutes: Number(durationMinutes) || TEST_BANK[id].durationMinutes,
    questions: questions || TEST_BANK[id].questions
  };

  res.json({ message: "Test updated successfully", test: TEST_BANK[id] });
});

// 4. Delete a test
app.delete('/api/admin/tests/:id', (req, res) => {
  const clientKey = req.headers['x-admin-key'];
  if (clientKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Unauthorized: Invalid admin key" });
  }

  const { id } = req.params;
  if (!TEST_BANK[id]) {
    return res.status(404).json({ error: "Test not found" });
  }

  delete TEST_BANK[id];
  res.json({ message: `Test ${id} deleted successfully` });
});
