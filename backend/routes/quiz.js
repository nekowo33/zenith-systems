const router = require('express').Router();
const c = require('../controllers/quizController');

router.post('/recommend', c.recommend);

module.exports = router;
