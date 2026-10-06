// Локальный запуск: node server/index.js
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Flight Planner: http://localhost:${PORT}`));
