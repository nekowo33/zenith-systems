const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/orderController');

router.use(auth);
router.post('/', c.checkout);
router.get('/', c.list);

module.exports = router;
