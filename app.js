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
    }
});

const User = mongoose.model('User', userSchema);

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next(); // User is logged in, proceed to the route
    }
    // User is not logged in, redirect to login page
    // You could also pass a message e.g. req.flash('error', 'Please log in to view this page.');
    res.redirect('/login'); 
};

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

app.get('/add-food', isAuthenticated, (req, res) => {
    res.render('add-food');
});

app.post('/add-food', isAuthenticated, async (req, res) => {
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
app.get('/edit-food/:id', isAuthenticated, async (req, res) => {
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
app.post('/edit-food/:id', isAuthenticated, async (req, res) => {
    try {
        await Food.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.redirect('/');
    } catch (err) {
        console.error('Error updating food:', err);
        res.status(500).send('Error updating food item');
    }
});

// Route to handle deleting a food item
app.post('/delete-food/:id', isAuthenticated, async (req, res) => {
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
            username: user.username
            // Add any other user properties you want in the session
        };

        res.redirect('/'); // Redirect to homepage or dashboard

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