const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/cartController');

router.use(auth);
router.get('/', c.get);
router.post('/', c.add);
router.patch('/:itemId', c.update);
router.delete('/:itemId', c.remove);

module.exports = router;
