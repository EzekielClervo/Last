/**
 * Instagram Automation Tool Server
 * Express server with authentication and automation routes.
 */

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const MemoryStore = require('memorystore')(session);
const crypto = require('crypto');
const automationRoutes = require('./automation-routes');

// Create Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  cookie: { maxAge: 86400000 }, // 24 hours
  store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired entries every 24h
  secret: process.env.SESSION_SECRET || 'instagram-automation-secret',
  resave: false,
  saveUninitialized: false
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// In-memory storage for users, accounts, cookies, logs
const storage = new MemStorage();
app.locals.storage = storage;

// Create default admin user
storage.createAdminUser();

// Helper functions for password hashing
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

async function comparePasswords(supplied, stored) {
  return new Promise((resolve, reject) => {
    const [salt, key] = stored.split(':');
    crypto.scrypt(supplied, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}

// Configure passport local strategy
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      
      const isValid = await comparePasswords(password, user.password);
      if (!isValid) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Route middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

// API Routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }
    
    const hashedPassword = await hashPassword(password);
    const user = await storage.createUser({
      username,
      email,
      password: hashedPassword,
      role: "user"
    });
    
    // Auto-login after registration
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging in after registration" });
      }
      return res.json({ message: "Registration successful", user: { ...user, password: undefined } });
    });
  } catch (error) {
    res.status(500).json({ message: "Registration error", error: error.message });
  }
});

app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
  res.json({ message: "Login successful", user: { ...req.user, password: undefined } });
});

app.post("/api/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logout successful" });
  });
});

app.get("/api/auth/user", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.json({ user: { ...req.user, password: undefined } });
});

// Cookie routes
app.post("/api/instagram/cookies", async (req, res) => {
  try {
    const { email, password } = req.body;
    const { getInstagramCookies } = require('./instagram-cookie-retriever');
    
    const result = await getInstagramCookies(email, password);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error retrieving Instagram cookies", 
      error: error.message 
    });
  }
});

app.post("/api/instagram/save-cookie", isAuthenticated, async (req, res) => {
  try {
    const { name, cookieString } = req.body;
    
    if (!name || !cookieString) {
      return res.status(400).json({ message: "Name and cookie string are required" });
    }
    
    const { isLoggedIn } = require('./instagram-check-login');
    const validCookie = await isLoggedIn(cookieString);
    
    if (!validCookie) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid or expired cookie" 
      });
    }
    
    const cookie = await storage.createCookie({
      userId: req.user.id,
      name,
      cookieString
    });
    
    res.json({ 
      success: true, 
      message: "Cookie saved successfully", 
      cookie 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error saving cookie", 
      error: error.message 
    });
  }
});

app.get("/api/instagram/cookies", isAuthenticated, async (req, res) => {
  try {
    const cookies = await storage.getCookiesByUserId(req.user.id);
    res.json({ cookies });
  } catch (error) {
    res.status(500).json({ 
      message: "Error retrieving cookies", 
      error: error.message 
    });
  }
});

// Register automation routes
app.use('/api/automation', automationRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('public'));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// In-memory storage class
class MemStorage {
  constructor() {
    this.users = new Map();
    this.instagramAccounts = new Map();
    this.cookies = new Map();
    this.activityLogs = new Map();
    this.userId = 1;
    this.accountId = 1;
    this.cookieId = 1;
    this.logId = 1;
  }
  
  async createAdminUser() {
    const hashedPassword = await hashPassword('david@@@');
    this.users.set(1, {
      id: 1,
      username: 'david',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date()
    });
    this.userId++;
  }
  
  async getUser(id) {
    return this.users.get(Number(id));
  }
  
  async getUserByUsername(username) {
    for (const [_, user] of this.users.entries()) {
      if (user.username === username) {
        return user;
      }
    }
    return undefined;
  }
  
  async createUser(userData) {
    const id = this.userId++;
    const user = { ...userData, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }
  
  async getAllUsers() {
    return Array.from(this.users.values());
  }
  
  async deleteUser(id) {
    return this.users.delete(Number(id));
  }
  
  // Instagram account methods
  async getInstagramAccount(id) {
    return this.instagramAccounts.get(Number(id));
  }
  
  async getInstagramAccounts(userId) {
    const accounts = [];
    for (const account of this.instagramAccounts.values()) {
      if (account.userId === Number(userId)) {
        accounts.push(account);
      }
    }
    return accounts;
  }
  
  async createInstagramAccount(account) {
    const id = this.accountId++;
    const newAccount = { ...account, id, createdAt: new Date() };
    this.instagramAccounts.set(id, newAccount);
    return newAccount;
  }
  
  async deleteInstagramAccount(id) {
    return this.instagramAccounts.delete(Number(id));
  }
  
  // Cookie methods
  async getCookie(id) {
    return this.cookies.get(Number(id));
  }
  
  async getCookiesByUserId(userId) {
    const cookies = [];
    for (const cookie of this.cookies.values()) {
      if (cookie.userId === Number(userId)) {
        cookies.push(cookie);
      }
    }
    return cookies;
  }
  
  async createCookie(cookie) {
    const id = this.cookieId++;
    const newCookie = { ...cookie, id, createdAt: new Date() };
    this.cookies.set(id, newCookie);
    return newCookie;
  }
  
  async deleteCookie(id) {
    return this.cookies.delete(Number(id));
  }
  
  // Activity log methods
  async getActivityLog(id) {
    return this.activityLogs.get(Number(id));
  }
  
  async getActivityLogsByUserId(userId, limit = 50) {
    const logs = [];
    for (const log of this.activityLogs.values()) {
      if (log.userId === Number(userId)) {
        logs.push(log);
      }
    }
    
    // Sort by timestamp (newest first) and limit results
    return logs
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  
  async createActivityLog(log) {
    const id = this.logId++;
    const newLog = { ...log, id, createdAt: new Date() };
    this.activityLogs.set(id, newLog);
    return newLog;
  }
  
  async updateActivityLog(id, updates) {
    const log = this.activityLogs.get(Number(id));
    if (!log) return false;
    
    const updatedLog = { ...log, ...updates, updatedAt: new Date() };
    this.activityLogs.set(Number(id), updatedLog);
    return updatedLog;
  }
}
