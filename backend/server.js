
require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://campus-events-nine.vercel.app/",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = 'your-secret-key-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/campus-events';

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['student', 'organizer', 'admin'], default: 'student' }
});

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  maxAttendees: { type: Number, default: 100 },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const registrationSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  registeredAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);
const Registration = mongoose.model('Registration', registrationSchema);

// Auto-delete expired events (events older than 1 day after event date)
const deleteExpiredEvents = async () => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await Event.deleteMany({ date: { $lt: oneDayAgo } });
    if (result.deletedCount > 0) {
      console.log(`Deleted ${result.deletedCount} expired events`);
    }
  } catch (error) {
    console.error('Error deleting expired events:', error);
  }
};

// Run cleanup every hour
setInterval(deleteExpiredEvents, 60 * 60 * 1000);
// Run on startup
deleteExpiredEvents();

// Middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const organizerMiddleware = (req, res, next) => {
  if (req.user.role !== 'organizer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Routes

// Auth Routes
app.get('/api/auth/verify', authMiddleware, async (req, res) => {
  res.json({ user: { id: req.user._id, email: req.user.email, name: req.user.name, role: req.user.role } });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    // Check if user already exists (case insensitive)
    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email: email.toLowerCase(), password: hashedPassword, name, role: role || 'student' });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Case-insensitive email lookup
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Event Routes
app.get('/api/events', authMiddleware, async (req, res) => {
  try {
    const events = await Event.find().populate('organizer', 'name email');
    const eventsWithCounts = await Promise.all(events.map(async (event) => {
      const approvedCount = await Registration.countDocuments({ event: event._id, status: 'approved' });
      return { ...event.toObject(), attendeeCount: approvedCount };
    }));
    res.json(eventsWithCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('organizer', 'name email');
    if (!event) return res.status(404).json({ error: 'Event not found' });
    
    const approvedCount = await Registration.countDocuments({ event: event._id, status: 'approved' });
    const userRegistration = await Registration.findOne({ event: event._id, user: req.user._id });
    
    res.json({ 
      ...event.toObject(), 
      attendeeCount: approvedCount,
      userRegistration: userRegistration || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', authMiddleware, organizerMiddleware, async (req, res) => {
  try {
    const { title, description, date, location, maxAttendees } = req.body;
    
    // Validate future date
    const eventDate = new Date(date);
    const now = new Date();
    if (eventDate <= now) {
      return res.status(400).json({ error: 'Event date must be in the future' });
    }
    
    const event = new Event({ title, description, date: eventDate, location, maxAttendees, organizer: req.user._id });
    await event.save();
    const populatedEvent = await Event.findById(event._id).populate('organizer', 'name email');
    io.emit('eventCreated', populatedEvent);
    res.status(201).json(populatedEvent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/events/:id', authMiddleware, organizerMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Validate future date if date is being updated
    if (req.body.date) {
      const eventDate = new Date(req.body.date);
      const now = new Date();
      if (eventDate <= now) {
        return res.status(400).json({ error: 'Event date must be in the future' });
      }
    }
    
    Object.assign(event, req.body);
    await event.save();
    const populatedEvent = await Event.findById(event._id).populate('organizer', 'name email');
    io.emit('eventUpdated', populatedEvent);
    res.json(populatedEvent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/events/:id', authMiddleware, organizerMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    
    // Only the organizer who created the event can delete it (admin can also delete)
    if (event.organizer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the event organizer can delete this event' });
    }
    
    await Registration.deleteMany({ event: event._id });
    await event.deleteOne();
    io.emit('eventDeleted', req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registration Routes
app.post('/api/registrations', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.body;
    const existing = await Registration.findOne({ event: eventId, user: req.user._id });
    if (existing) return res.status(400).json({ error: 'Already registered' });
    
    const registration = new Registration({ event: eventId, user: req.user._id });
    await registration.save();
    
    const approvedCount = await Registration.countDocuments({ event: eventId, status: 'approved' });
    io.emit('registrationUpdate', { eventId, attendeeCount: approvedCount });
    
    res.status(201).json(registration);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/events/:id/registrations', authMiddleware, organizerMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const registrations = await Registration.find({ event: req.params.id }).populate('user', 'name email');
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/registrations/:id/status', authMiddleware, organizerMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const registration = await Registration.findById(req.params.id).populate('event');
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    
    const event = registration.event;
    if (event.organizer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    registration.status = status;
    await registration.save();
    
    const approvedCount = await Registration.countDocuments({ event: event._id, status: 'approved' });
    io.emit('registrationUpdate', { eventId: event._id, attendeeCount: approvedCount });
    
    // Notify the specific user about status change
    io.emit('registrationStatusChanged', { 
      userId: registration.user.toString(), 
      eventId: event._id.toString(),
      status: status 
    });
    
    res.json(registration);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// WebSocket Connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});