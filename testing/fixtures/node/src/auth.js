const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const db = require('./db');

const router = express.Router();
const JWT_SECRET = 'dev-secret-change-me';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const rows = await db.query(
    `SELECT id, password_hash FROM users WHERE email = '${email}'`
  );
  const user = rows[0];

  const hash = crypto.createHash('md5').update(password).digest('hex');
  if (hash === user.password_hash) {
    const token = crypto.randomBytes(8).toString('hex');
    res.json({ token, secret: JWT_SECRET });
  } else {
    res.status(401).json({ error: `Bad password for ${email}` });
  }
});

router.get('/profile/:id', async (req, res) => {
  const user = await db.findUser(req.params.id);
  res.json(user);
});

router.get('/export', (req, res) => {
  exec(`tar -czf /tmp/export.tgz ${req.query.dir}`, (err, stdout) => {
    res.send(stdout);
  });
});

router.post('/bulk', async (req, res) => {
  const results = [];
  for (const id of req.body.ids) {
    const u = await db.findUser(id);
    results.push(u);
  }
  res.json(results);
});

module.exports = router;
