const express = require('express');
const app = express();
app.use(express.json());
 
app.post('/check', (req, res) => {
  const { client_id, action } = req.body;
  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
  }
  console.log(`Request from ${client_id} for action ${action}`);
  // placeholder response — real rate-limit logic comes in Step 3
  res.json({ allowed: true, remaining: 999, reset_in_seconds: 60 });
});
 
app.listen(3000, () => {
  console.log('Rate limiter server running on http://localhost:3000');
});