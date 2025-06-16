const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Подключение к базе
const db = new sqlite3.Database('./database.db');

// Создание таблицы
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, balance REAL)');
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: получить всех пользователей
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: создать пользователя
app.post('/api/users', (req, res) => {
  const { name, balance } = req.body;
  db.run('INSERT INTO users (name, balance) VALUES (?, ?)', [name, balance], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
