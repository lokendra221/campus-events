
import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Clock, CheckCircle, XCircle, AlertCircle, Trash2 } from 'lucide-react';
import io from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || 'https://campus-events-2.onrender.com/api';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://campus-events-2.onrender.com';

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ email: '', password: '', name: '', role: 'student' });
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', date: '', location: '', maxAttendees: 100 });
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);

  // Initialize socket connection
  useEffect(() => {
    if (token && user) {
      const newSocket = io(SOCKET_URL);
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket connected');
      });

      newSocket.on('registrationUpdate', (data) => {
        setEvents(prev => prev.map(event => 
          event._id === data.eventId 
            ? { ...event, attendeeCount: data.attendeeCount }
            : event
        ));
        setSelectedEvent(prev => {
          if (prev && prev._id === data.eventId) {
            return { ...prev, attendeeCount: data.attendeeCount };
          }
          return prev;
        });
      });

      // Listen for registration status changes for this user
      newSocket.on('registrationStatusChanged', async (data) => {
        if (data.userId === user.id) {
          // Refresh the selected event to show updated status
          if (data.eventId) {
            try {
              const response = await fetch(`${API_BASE}/events/${data.eventId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const eventData = await response.json();
              setSelectedEvent(prev => {
                if (prev && prev._id === data.eventId) {
                  return eventData;
                }
                return prev;
              });
            } catch (err) {
              console.error('Failed to fetch event details:', err);
            }
          }
        }
      });

      newSocket.on('eventCreated', (event) => {
        setEvents(prev => [...prev, event]);
      });

      newSocket.on('eventUpdated', (event) => {
        setEvents(prev => prev.map(e => e._id === event._id ? event : e));
      });

      newSocket.on('eventDeleted', (eventId) => {
        setEvents(prev => prev.filter(e => e._id !== eventId));
        if (selectedEvent && selectedEvent._id === eventId) {
          setSelectedEvent(null);
        }
      });

      return () => newSocket.close();
    }
    // eslint-disable-next-line
  }, [token, user]);

  const verifyToken = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error('Token verification failed:', err);
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_BASE}/events`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setEvents(data);
    } catch (err) {
      setError('Failed to fetch events');
      console.error(err);
    }
  };

  const fetchEventDetails = async (eventId) => {
    try {
      const response = await fetch(`${API_BASE}/events/${eventId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSelectedEvent(data);
    } catch (err) {
      console.error('Failed to fetch event details:', err);
    }
  };

  // Check if user is logged in
  useEffect(() => {
    if (token) {
      verifyToken();
    }
    // eslint-disable-next-line
  }, [token]);

  // Fetch events when logged in
  useEffect(() => {
    if (user) {
      fetchEvents();
    }
    // eslint-disable-next-line
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const data = await response.json();
      
      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData)
      });

      const data = await response.json();
      
      if (response.ok) {
        setError('');
        alert('Registration successful! Please login.');
        setIsRegisterMode(false);
        setRegisterData({ email: '', password: '', name: '', role: 'student' });
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setSelectedEvent(null);
    setRegistrations([]);
    setEvents([]);
    if (socket) socket.close();
  };

  const handleEventClick = async (event) => {
    setSelectedEvent(event);
    
    // Fetch full event details including user registration status
    await fetchEventDetails(event._id);
    
    if (user?.role === 'organizer' || user?.role === 'admin') {
      try {
        const response = await fetch(`${API_BASE}/events/${event._id}/registrations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        setRegistrations(data);
      } catch (err) {
        console.error('Failed to fetch registrations:', err);
      }
    }
  };

  const handleRegisterForEvent = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ eventId: selectedEvent._id })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert('Registration submitted! Waiting for organizer approval.');
        await fetchEventDetails(selectedEvent._id);
      } else {
        alert(data.error || 'Registration failed');
      }
    } catch (err) {
      alert('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReject = async (regId, status) => {
    try {
      const response = await fetch(`${API_BASE}/registrations/${regId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      const data = await response.json();
      
      if (response.ok) {
        setRegistrations(prev => prev.map(reg => 
          reg._id === regId ? data : reg
        ));
      } else {
        alert('Failed to update status');
      }
    } catch (err) {
      alert('Network error. Please try again.');
      console.error(err);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Event deleted successfully!');
        setSelectedEvent(null);
        setRegistrations([]);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete event');
      }
    } catch (err) {
      alert('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newEvent)
      });

      const data = await response.json();
      
      if (response.ok) {
        setShowCreateEvent(false);
        setNewEvent({ title: '', description: '', date: '', location: '', maxAttendees: 100 });
        alert('Event created successfully!');
      } else {
        alert(data.error || 'Failed to create event');
      }
    } catch (err) {
      alert('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Get minimum date for event creation (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 16);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md backdrop-blur-sm">
          <div className="text-center mb-6">
            <div className="inline-block p-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full mb-3">
              <Calendar className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Campus Events</h1>
            <p className="text-gray-500 text-sm mt-2">Connect, Engage, Participate</p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {!isRegisterMode ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="enter your email id"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter password"
                  required
                  disabled={loading}
                />
              </div>
              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
              <p className="text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <button 
                  type="button" 
                  onClick={() => {
                    setIsRegisterMode(true);
                    setError('');
                  }} 
                  className="text-purple-600 hover:text-purple-700 font-semibold hover:underline"
                >
                  Register
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  type="text"
                  value={registerData.name}
                  onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={registerData.email}
                  onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={registerData.password}
                  onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={loading}
                  minLength="6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={registerData.role}
                  onChange={(e) => setRegisterData({ ...registerData, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                >
                  <option value="student">Student</option>
                  <option value="organizer">Organizer</option>
                </select>
              </div>
              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
              <p className="text-center text-sm text-gray-600">
                Already have an account?{' '}
                <button 
                  type="button" 
                  onClick={() => {
                    setIsRegisterMode(false);
                    setError('');
                  }} 
                  className="text-purple-600 hover:text-purple-700 font-semibold hover:underline"
                >
                  Login
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (showCreateEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <header className="bg-white shadow-md border-b-2 border-purple-100">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Create New Event</h1>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-purple-100">
            <form onSubmit={handleCreateEvent} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Event Title</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows="4"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date & Time (Future dates only)</label>
                <input
                  type="datetime-local"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={loading}
                  min={getMinDate()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Attendees</label>
                <input
                  type="number"
                  value={newEvent.maxAttendees}
                  onChange={(e) => setNewEvent({ ...newEvent, maxAttendees: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  min="1"
                  required
                  disabled={loading}
                />
              </div>

              <div className="flex gap-4">
                <button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Event'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateEvent(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-all font-medium"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <header className="bg-white shadow-md border-b-2 border-purple-100">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Campus Events</h1>
            <p className="text-sm text-gray-600">Welcome, <span className="font-semibold text-purple-600">{user.name}</span> <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">{user.role}</span></p>
          </div>
          <div className="flex gap-2">
            {(user.role === 'organizer' || user.role === 'admin') && (
              <button
                onClick={() => setShowCreateEvent(true)}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium"
              >
                + Create Event
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {!selectedEvent ? (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Upcoming Events</h2>
              <div className="h-1 w-20 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full"></div>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-lg border border-purple-100">
                <div className="inline-block p-4 bg-purple-100 rounded-full mb-4">
                  <Calendar className="w-12 h-12 text-purple-600" />
                </div>
                <p className="text-gray-500 text-lg mb-4">No events available yet.</p>
                {(user.role === 'organizer' || user.role === 'admin') && (
                  <button
                    onClick={() => setShowCreateEvent(true)}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium"
                  >
                    Create First Event
                  </button>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map(event => (
                  <div
                    key={event._id}
                    onClick={() => handleEventClick(event)}
                    className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all cursor-pointer p-6 border border-purple-50 hover:border-purple-200 transform hover:-translate-y-1"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-lg">
                        <Calendar className="w-5 h-5 text-purple-600" />
                      </div>
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                        {event.attendeeCount}/{event.maxAttendees}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">{event.title}</h3>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{event.description}</p>
                    
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-500" />
                        <span>{new Date(event.date).toLocaleDateString()} • {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-purple-500" />
                        <span>{event.location}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {event.organizer?.name || 'Unknown'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <button
              onClick={() => { setSelectedEvent(null); setRegistrations([]); }}
              className="mb-6 flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium transition"
            >
              ← Back to Events
            </button>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-purple-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-800 mb-2">{selectedEvent.title}</h2>
                  <div className="h-1 w-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full"></div>
                </div>
                {(user.role === 'organizer' || user.role === 'admin') && selectedEvent.organizer?._id === user.id && (
                  <button
                    onClick={() => handleDeleteEvent(selectedEvent._id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 font-medium"
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
              <p className="text-gray-600 mb-8 text-lg">{selectedEvent.description}</p>

              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
                  <div className="p-3 bg-white rounded-lg shadow-sm">
                    <Calendar className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Date & Time</p>
                    <p className="font-bold text-gray-800">{new Date(selectedEvent.date).toLocaleDateString()}</p>
                    <p className="text-sm text-gray-600">{new Date(selectedEvent.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                  <div className="p-3 bg-white rounded-lg shadow-sm">
                    <MapPin className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Location</p>
                    <p className="font-bold text-gray-800">{selectedEvent.location}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                  <div className="p-3 bg-white rounded-lg shadow-sm">
                    <Users className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Attendees</p>
                    <p className="font-bold text-2xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                      {selectedEvent.attendeeCount}/{selectedEvent.maxAttendees}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100">
                  <div className="p-3 bg-white rounded-lg shadow-sm">
                    <Clock className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Organizer</p>
                    <p className="font-bold text-gray-800">{selectedEvent.organizer?.name || 'Unknown'}</p>
                  </div>
                </div>
              </div>

              {user.role === 'student' && !selectedEvent.userRegistration && (
                <button
                  onClick={handleRegisterForEvent}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-bold text-lg disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Registering...' : ' Register for Event'}
                </button>
              )}

              {selectedEvent.userRegistration && (
                <div className={`p-5 rounded-xl border-2 ${
                  selectedEvent.userRegistration.status === 'approved' ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' :
                  selectedEvent.userRegistration.status === 'rejected' ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300' :
                  'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300'
                }`}>
                  <div className="flex items-center gap-3">
                    {selectedEvent.userRegistration.status === 'approved' && <CheckCircle className="w-6 h-6 text-green-600" />}
                    {selectedEvent.userRegistration.status === 'rejected' && <XCircle className="w-6 h-6 text-red-600" />}
                    {selectedEvent.userRegistration.status === 'pending' && <AlertCircle className="w-6 h-6 text-yellow-600" />}
                    <span className="font-bold text-lg">
                      {selectedEvent.userRegistration.status === 'approved' && ' Registration Approved - You are attending this event!'}
                      {selectedEvent.userRegistration.status === 'rejected' && ' Registration Rejected - You are not allowed to attend this event'}
                      {selectedEvent.userRegistration.status === 'pending' && ' Registration Pending - Waiting for organizer approval'}
                    </span>
                  </div>
                </div>
              )}

              {(user.role === 'organizer' || user.role === 'admin') && registrations.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-2xl font-bold text-gray-800">Manage Registrations</h3>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                      {registrations.length} Total
                    </span>
                  </div>
                  <div className="space-y-3">
                    {registrations.map(reg => (
                      <div key={reg._id} className="flex items-center justify-between p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-all">
                        <div>
                          <p className="font-bold text-gray-800 text-lg">{reg.user?.name || 'Unknown'}</p>
                          <p className="text-sm text-gray-600">{reg.user?.email || 'N/A'}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            📅 Registered: {new Date(reg.registeredAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {reg.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => handleApproveReject(reg._id, 'approved')}
                                className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg font-medium"
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => handleApproveReject(reg._id, 'rejected')}
                                className="px-5 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg hover:from-red-600 hover:to-rose-700 transition-all shadow-md hover:shadow-lg font-medium"
                              >
                                ✗ Reject
                              </button>
                            </>
                          ) : (
                            <span className={`px-5 py-2 rounded-lg text-sm font-bold ${
                              reg.status === 'approved' ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-red-100 text-red-700 border-2 border-red-300'
                            }`}>
                              {reg.status === 'approved' ? ' Approved' : ' Rejected'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;