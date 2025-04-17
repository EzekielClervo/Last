/**
 * Automation Routes
 * Express routes for Instagram automation actions.
 */

const express = require('express');
const router = express.Router();
const igAutomation = require('./instagram-automation');

// Helper middleware for authentication
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

// Automation Endpoints
router.post("/run", isAuthenticated, async (req, res) => {
  try {
    const { type, username, postUrl, commentText, commentId } = req.body;
    
    // Get the user's cookies to run the automation
    const cookies = await req.app.locals.storage.getCookiesByUserId(req.user.id);
    if (!cookies || cookies.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No cookies available. Please add an account or cookie first." 
      });
    }
    
    let result = { success: false, message: "Unknown automation type" };
    const cookieValue = cookies[0].cookieString;
    
    // Create activity log entry
    const logEntry = {
      userId: req.user.id,
      type,
      accountUsername: username || "Unknown",
      action: "Pending",
      status: "pending",
    };
    
    // Handle different automation types
    switch (type) {
      case "follow":
        if (!username) {
          return res.status(400).json({ success: false, message: "Username is required" });
        }
        logEntry.action = `Followed @${username}`;
        const activityLogFollow = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.followUser(username, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogFollow.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "unfollow":
        if (!username) {
          return res.status(400).json({ success: false, message: "Username is required" });
        }
        logEntry.action = `Unfollowed @${username}`;
        const activityLogUnfollow = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.unfollowUser(username, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogUnfollow.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "like":
        if (!postUrl) {
          return res.status(400).json({ success: false, message: "Post URL is required" });
        }
        logEntry.action = `Liked post: ${postUrl}`;
        const activityLogLike = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.likePost(postUrl, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogLike.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "unlike":
        if (!postUrl) {
          return res.status(400).json({ success: false, message: "Post URL is required" });
        }
        logEntry.action = `Unliked post: ${postUrl}`;
        const activityLogUnlike = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.unlikePost(postUrl, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogUnlike.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "comment":
        if (!postUrl || !commentText) {
          return res.status(400).json({ success: false, message: "Post URL and comment text are required" });
        }
        logEntry.action = `Commented on post: ${postUrl}`;
        const activityLogComment = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.commentPost(postUrl, commentText, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogComment.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "delete_comment":
        if (!commentId) {
          return res.status(400).json({ success: false, message: "Comment ID is required" });
        }
        logEntry.action = `Deleted comment: ${commentId}`;
        const activityLogDeleteComment = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.deleteComment(postUrl || "", commentId, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogDeleteComment.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "profile_info":
        if (!username) {
          return res.status(400).json({ success: false, message: "Username is required" });
        }
        logEntry.action = `Retrieved profile info: @${username}`;
        const activityLogProfile = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.getInstagramProfileInfo(username, cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogProfile.id, {
          status: result.success ? "success" : "failed"
        });
        break;
        
      case "duplicates":
        logEntry.action = "Removed duplicate accounts";
        const activityLogDuplicates = await req.app.locals.storage.createActivityLog(logEntry);
        
        result = await igAutomation.removeDuplicateAccounts(cookieValue);
        await req.app.locals.storage.updateActivityLog(activityLogDuplicates.id, {
          status: result.success ? "success" : "failed"
        });
        break;
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error running automation", 
      error: error.message 
    });
  }
});

// Get Instagram cookie from credentials
router.post("/get-cookie", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }
    
    const result = await igAutomation.getCookieFromCredentials(email, password);
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        message: result.message || "Failed to retrieve cookie" 
      });
    }
    
    res.json({ 
      success: true, 
      cookies: result.cookies,
      cookieString: result.cookieString
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error retrieving cookie", 
      error: error.message 
    });
  }
});

// Check if cookie is valid
router.post("/check-login", async (req, res) => {
  try {
    const { cookieString } = req.body;
    
    if (!cookieString) {
      return res.status(400).json({ 
        success: false, 
        message: "Cookie string is required" 
      });
    }
    
    const isValid = await igAutomation.isLoggedIn(cookieString);
    
    res.json({ 
      success: true, 
      isLoggedIn: isValid,
      message: isValid ? "Cookie is valid" : "Cookie is invalid or expired"
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error checking login status", 
      error: error.message 
    });
  }
});

module.exports = router;
