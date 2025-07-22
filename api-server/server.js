const app = require('./data.js');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Cambridge Dictionary API server running on http://localhost:${PORT}`);
});