const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const LOCAL_DIR = path.resolve(process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '../../uploads'));

// Uploaded files (reimbursement bills, documents) are private. Accept the JWT
// from the Authorization header OR a ?token= query param, because <img> tags
// cannot send headers.
async function authenticateFileRequest(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.split(' ')[1] : req.query.token;
    if (!token) return res.status(401).end();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive || user.isArchived) return res.status(401).end();
    req.user = user;
    next();
  } catch (_) {
    return res.status(401).end();
  }
}

router.get(/^\/(.+)$/, authenticateFileRequest, (req, res) => {
  const requested = req.params[0] || '';
  const full = path.resolve(LOCAL_DIR, requested);
  // Block path traversal — the resolved path must stay inside LOCAL_DIR.
  if (full !== LOCAL_DIR && !full.startsWith(LOCAL_DIR + path.sep)) {
    return res.status(400).end();
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).end();
  return res.sendFile(full);
});

module.exports = router;
