const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// MongoDB Connection Configuration
const MONGODB_URI = 'mongodb+srv://lonbg5417:JNLelJ2sFp7WF4xN@cluster0.v04u9ap.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

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

app.get('/add-food', (req, res) => {
    res.render('add-food');
});

app.post('/add-food', async (req, res) => {
    try {
        const newFood = new Food(req.body);
        await newFood.save();
        res.redirect('/');
    } catch (err) {
        console.error('Error adding food:', err);
        res.status(500).send('Error adding food item');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 