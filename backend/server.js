require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { errorHandler, notFound } = require('./middleware/error');

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5500'] }));
app.use(express.json());

// Static laptop images: /images/laptops/<slug>.png (a missing file just returns a JSON 404)
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/laptops', require('./routes/laptops'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zenith API running on http://localhost:${PORT}`));
