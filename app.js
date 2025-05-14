const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// MongoDB Connection Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lonbg5417:JNLelJ2sFp7WF4xN@cluster0.v04u9ap.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Session Configuration
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your secret key', // ควรเปลี่ยนเป็นค่าจาก environment variable
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: MONGODB_URI,
            collectionName: 'sessions' // Optional: specify collection name for sessions
        }),
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 // 1 day
        }
    })
);

// Middleware to make user available in all views
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user;
    next();
});

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('Successfully connected to MongoDB Atlas.');
    console.log('Database:', MONGODB_URI);
    seedUsers();
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

// Handle application termination
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error during MongoDB disconnection:', err);
        process.exit(1);
    }
});

// Food Schema
const foodSchema = new mongoose.Schema({
    name: String,
    description: String,
    price: Number,
    image: String,
    category: String
});

const Food = mongoose.model('Food', foodSchema);

// User Schema
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    }
});

const User = mongoose.model('User', userSchema);

// Function to seed initial admin and user accounts
async function seedUsers() {
    try {
        // Check for existing admin
        let admin = await User.findOne({ username: 'admin@gmail.com' });
        if (!admin) {
            const hashedPassword = await bcrypt.hash('123456', 10);
            admin = new User({
                username: 'admin@gmail.com',
                password: hashedPassword,
                role: 'admin'
            });
            await admin.save();
            console.log('Admin account seeded: admin@gmail.com');
        } else {
            console.log('Admin account admin@gmail.com already exists.');
        }
        
        // Check for existing user
        let regularUser = await User.findOne({ username: 'user@gmail.com' });
        if (!regularUser) {
            const hashedPassword = await bcrypt.hash('123456', 10);
            regularUser = new User({
                username: 'user@gmail.com',
                password: hashedPassword,
                role: 'user' // Default role is 'user', but explicitly set for clarity
            });
            await regularUser.save();
            console.log('User account seeded: user@gmail.com');
        } else {
            console.log('User account user@gmail.com already exists.');
        }
    } catch (error) {
        console.error('Error seeding users:', error);
    }
}

// Order Schema
const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        food: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Food',
            required: true
        },
        name: String, // Store name at time of order for history
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: Number // Store price at time of order
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },
    // Add other fields like shippingAddress, paymentDetails etc. as needed
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

const Order = mongoose.model('Order', orderSchema);

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next(); // User is logged in, proceed to the route
    }
    // User is not logged in, redirect to login page
    // You could also pass a message e.g. req.flash('error', 'Please log in to view this page.');
    res.redirect('/login'); 
};

// Middleware to check if user is an Admin
const isAdmin = (req, res, next) => {
    // relies on isAuthenticated to have already run and populated req.session.user
    if (req.session.user && req.session.user.role === 'admin') {
        return next(); // User is an admin, proceed
    }
    // User is not an admin
    // Optionally, you can send a forbidden status or redirect to a specific page
    // For now, let's send a 403 Forbidden status, or redirect to home for non-admins.
    // If you want to show a specific error page, you can render one here.
    // For simplicity, redirecting non-admins to the homepage if they try to access admin routes.
    // Or, you could send a 403 Forbidden status if you prefer.
    // res.status(403).send('Access Denied: You do not have admin privileges.');
    req.session.message = { type: 'error', text: 'You are not authorized to view this page.' }; // Example of a flash message setup
    res.redirect('/'); 
};

// USER ROUTES (Cart, Checkout, etc.)

// Add item to cart
app.post('/cart/add/:foodId', isAuthenticated, async (req, res) => {
    const { foodId } = req.params;
    try {
        const foodItem = await Food.findById(foodId);
        if (!foodItem) {
            // Handle case where food item is not found
            // req.session.message = { type: 'error', text: 'Food item not found.' };
            return res.redirect('/');
        }

        if (!req.session.cart) {
            req.session.cart = [];
        }

        const cart = req.session.cart;
        const existingItemIndex = cart.findIndex(item => item.foodId.toString() === foodId);

        if (existingItemIndex > -1) {
            // Item already in cart, increment quantity
            cart[existingItemIndex].quantity += 1;
        } else {
            // Add new item to cart
            cart.push({
                foodId: foodItem._id,
                name: foodItem.name,
                price: foodItem.price,
                image: foodItem.image, // Optional: if you want to show image in cart
                quantity: 1
            });
        }
        // req.session.message = { type: 'success', text: `Added ${foodItem.name} to cart!` };
        res.redirect('/'); // Or redirect to /cart

    } catch (error) {
        console.error("Error adding item to cart:", error);
        // req.session.message = { type: 'error', text: 'Could not add item to cart.' };
        res.redirect('/');
    }
});

app.get('/cart', isAuthenticated, (req, res) => {
    const cartItems = req.session.cart || [];
    let totalAmount = 0;
    if (cartItems.length > 0) {
        totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    res.render('cart', { 
        title: 'Your Shopping Cart', 
        cartItems: cartItems, 
        totalAmount: totalAmount 
    });
});

app.get('/checkout', isAuthenticated, (req, res) => {
    // For now, checkout is just a UI placeholder.
    // In a real app, you might pass cart total or other relevant info.
    res.render('checkout', { title: 'Checkout' });
});

app.post('/place-order', isAuthenticated, async (req, res) => {
    const cartItems = req.session.cart || [];
    if (cartItems.length === 0) {
        // req.session.message = { type: 'error', text: 'Your cart is empty. Please add items before placing an order.' };
        return res.redirect('/cart');
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    try {
        // For UI demonstration, we'll just generate a fake order ID
        const fakeOrderId = 'ORD' + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        // Log the order details that WOULD be saved
        console.log('Order placed (simulated):');
        console.log('User: ', req.session.user.username);
        console.log('Delivery Details: ', req.body);
        console.log('Items: ', cartItems.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })));
        console.log('Total Amount: ', totalAmount);
        
        // In a real app, create and save Order document here:
        // const newOrder = new Order({
        //     user: req.session.user._id,
        //     items: cartItems.map(item => ({ food: item.foodId, name:item.name, quantity: item.quantity, price: item.price })),
        //     totalAmount: totalAmount,
        //     deliveryDetails: req.body, // (e.g. fullName, phone, address from checkout form)
        //     paymentMethod: req.body.paymentMethod,
        //     status: 'Pending'
        // });
        // await newOrder.save();

        // Clear the cart from session after successful (simulated) order
        req.session.cart = []; 

        res.redirect(`/order-confirmation/${fakeOrderId}`);

    } catch (error) {
        console.error("Error during simulated order placement:", error);
        res.redirect('/checkout');
    }
});

app.get('/order-confirmation/:orderId', isAuthenticated, (req, res) => {
    // const message = req.session.message;
    // delete req.session.message; // Clear message after displaying

    res.render('order-confirmation', {
        title: 'Order Confirmed',
        orderId: req.params.orderId,
        // message: message
    });
});

// ADMIN ROUTES
app.get('/admin/dashboard', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const totalFoodItems = await Food.countDocuments();
        const totalOrders = await Order.countDocuments();
        // Later, you can add more stats: total revenue, recent orders, etc.
        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            totalFoodItems,
            totalOrders
            // Pass other stats here
        });
    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        res.status(500).send("Error loading admin dashboard");
    }
});

// Routes
app.get('/', async (req, res) => {
    try {
        const foods = await Food.find();
        res.render('index', { foods });
    } catch (err) {
        console.error('Error fetching foods:', err);
        res.status(500).send('Error loading menu items');
    }
});

app.get('/add-food', isAuthenticated, isAdmin, (req, res) => {
    res.render('add-food');
});

app.post('/add-food', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const newFood = new Food(req.body);
        await newFood.save();
        res.redirect('/');
    } catch (err) {
        console.error('Error adding food:', err);
        res.status(500).send('Error adding food item');
    }
});

// Route to display the edit food form
app.get('/edit-food/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const food = await Food.findById(req.params.id);
        if (!food) {
            return res.status(404).send('Food item not found');
        }
        res.render('edit-food', { food });
    } catch (err) {
        console.error('Error fetching food for edit:', err);
        res.status(500).send('Error loading edit form');
    }
});

// Route to handle the submission of the edit food form
app.post('/edit-food/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await Food.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.redirect('/');
    } catch (err) {
        console.error('Error updating food:', err);
        res.status(500).send('Error updating food item');
    }
});

// Route to handle deleting a food item
app.post('/delete-food/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await Food.findByIdAndDelete(req.params.id);
        res.redirect('/');
    } catch (err) {
        console.error('Error deleting food:', err);
        res.status(500).send('Error deleting food item');
    }
});

// AUTHENTICATION ROUTES

// Display registration form
app.get('/register', (req, res) => {
    res.render('register'); // We will create views/register.ejs
});

// Handle registration
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            // You might want to send a message back to the form instead of just sending text
            return res.status(400).send('Username already exists. Please choose another one.'); 
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

        // Create new user
        const newUser = new User({
            username,
            password: hashedPassword
        });
        await newUser.save();

        // Redirect to login page after successful registration
        // Or you could log them in directly by setting req.session.user
        res.redirect('/login'); 

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Something went wrong during registration.');
    }
});

// Display login form
app.get('/login', (req, res) => {
    res.render('login'); // We will create views/login.ejs
});

// Handle login
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user) {
            // User not found
            // Consider rendering login page with an error message
            return res.status(400).send('Invalid username or password.'); 
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            // Password doesn't match
            // Consider rendering login page with an error message
            return res.status(400).send('Invalid username or password.');
        }

        // Login successful, store user info in session
        req.session.user = {
            _id: user._id,
            username: user.username,
            role: user.role // Add role to session
        };

        // Redirect based on role
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard'); // We'll create this route next
        } else {
            res.redirect('/'); 
        }

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Something went wrong during login.');
    }
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).send('Could not log out, please try again.');
        }
        res.redirect('/');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 