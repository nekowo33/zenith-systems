const router = require('express').Router();
const c = require('../controllers/laptopController');

// /compare and /featured must come before /:id
router.get('/', c.list);
router.get('/compare', c.compare);
router.get('/featured', c.featured);
router.get('/:id', c.getOne);

module.exports = router;
