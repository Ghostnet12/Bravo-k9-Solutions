const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

// Import Stripe if available.  Stripe will be used to create secure checkout
// sessions for accepting card payments.  The dependency is declared in
// package.json, but it may not be installed in local development due to
// network restrictions.  When deployed to a platform like Render the
// dependency will be installed automatically.
let stripe;
try {
  const Stripe = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch (err) {
  console.warn('Stripe module not available. Payment API will be disabled.');
}

/*
 * Simple Express server for a MERN stack deployment.
 *
 * This server serves static assets from the `client` directory and exposes
 * a minimal API for storing contact/booking requests in MongoDB.  It uses
 * Mongoose to connect to MongoDB via a connection string supplied via
 * the `MONGO_URI` environment variable.  If no connection string is
 * provided the API routes will return an error explaining that the
 * database is unavailable.
 */

const app = express();

// Parse JSON bodies for POST requests
app.use(express.json());

// Attempt to connect to MongoDB if a URI was supplied
let Booking;
const mongoUri = process.env.MONGO_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log('Connected to MongoDB');
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err);
    });

  // Define a simple schema for booking/consultation requests
  const bookingSchema = new mongoose.Schema(
    {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String },
      message: { type: String },
      slot: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
    { collection: 'bookings' }
  );
  Booking = mongoose.model('Booking', bookingSchema);
} else {
  console.warn('No MONGO_URI environment variable found. API routes will be disabled.');
}

/**
 * API endpoint to create a booking request.  Expects a JSON body with
 * { name, email, phone, message, slot }.  If MongoDB is not configured
 * the request will return a 503 error.
 */
app.post('/api/bookings', async (req, res) => {
  if (!Booking) {
    return res
      .status(503)
      .json({ error: 'Database not configured. Please supply a MONGO_URI.' });
  }
  try {
    const booking = new Booking(req.body);
    await booking.validate();
    const saved = await booking.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * API endpoint to list recent bookings.  Useful for verifying that
 * submissions are being stored.  Returns the 50 most recent bookings.
 */
app.get('/api/bookings', async (req, res) => {
  if (!Booking) {
    return res
      .status(503)
      .json({ error: 'Database not configured. Please supply a MONGO_URI.' });
  }
  const bookings = await Booking.find().sort({ createdAt: -1 }).limit(50);
  res.json(bookings);
});

// Serve static files from the React-like client folder
const clientDir = path.join(__dirname, 'client');
app.use(express.static(clientDir));

/**
 * Create a Stripe Checkout session.  This endpoint expects a JSON body with
 * an optional `amount` field representing the total in cents.  If no amount
 * is provided the route will return a 400 error.  A `success_url` and
 * `cancel_url` must be provided via environment variables (STRIPE_SUCCESS_URL
 * and STRIPE_CANCEL_URL) for the redirect after payment.  If Stripe is not
 * configured the route will return a 503 error.
 */
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res
      .status(503)
      .json({ error: 'Payments are not configured on the server.' });
  }
  const { amount } = req.body;
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid amount.' });
  }
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  if (!successUrl || !cancelUrl) {
    return res.status(500).json({ error: 'Server misconfiguration: missing success or cancel URL.' });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Bravo K9 Training Session' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating Stripe checkout session:', err);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// Fallback: serve index.html for any unknown route (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});