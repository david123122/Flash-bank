const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance REAL DEFAULT 1000
  )`);
});

// Регистрация
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  stmt.run(username, password, function(err) {
    if (err) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  });
});

// Вход
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  });
});

// Middleware аутентификации
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// Баланс
app.get('/balance', authenticate, (req, res) => {
  db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ balance: row ? row.balance : 0 });
  });
});

// Перевод средств
app.post('/transfer', authenticate, (req, res) => {
  const { to, amount } = req.body;
  if (!to || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid transfer data' });

  db.get('SELECT balance FROM users WHERE username = ?', [to], (err, recipient) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, sender) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!sender) return res.status(404).json({ error: 'Sender not found' });
      if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

      // Начинаем транзакцию
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.user.id]);
        db.run('UPDATE users SET balance = balance + ? WHERE username = ?', [amount, to]);
        db.run('COMMIT', (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Transfer failed' });
          }
          res.json({ success: true, message: `Transferred ${amount} to ${to}` });
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
