// server/index.js
const express = require('express');
const app = express();
const PORT = 3001;

// A simple route to check if the server is running
app.get('/api', (req, res) => {
  res.json({ message: "Hello from the server!" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});