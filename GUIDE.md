# Complete Deployment Guide for License Validation System

## 1. Cloudflare Workers Deployment

### Step 1: Create Cloudflare Account
1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Click "Sign up" in the top right corner
3. Enter your email and create a password
4. Complete the verification process via email
5. Log in to your Cloudflare dashboard

### Step 2: Deploy the Worker
1. In your Cloudflare dashboard, click "Workers & Pages" in the left sidebar
2. Click "Create application" 
3. Select "Create Worker"
4. Choose a subdomain (e.g., `licensecheckerwhop`)
5. Click "Deploy"

### Step 3: Add Your Worker Code
1. On your Worker page, find the code editor
2. Replace the default code with your `worker.js` file contents
3. Click "Save and Deploy"
4. Your worker URL will be something like: `https://licensecheckerwhop.your-subdomain.workers.dev`

### Step 4: Add Environment Variable
1. In your Worker dashboard, click "Settings" tab
2. Click "Environment Variables"
3. Add a new variable:
   - Key: `WHOP_API_KEY`
   - Value: Your Whop API key (we'll get this in the next section)
4. Click "Save"

### Step 5: Test Your Worker
1. Visit your worker URL: `https://licensecheckerwhop.your-subdomain.workers.dev`
2. You should see a 404 error (which is normal since we only have specific endpoints)
3. The worker is deployed successfully

## 2. Whop Configuration

### Step 1: Get Whop API Key
1. Go to [https://whop.com](https://whop.com)
2. Sign up for an account or log in
3. Click on your profile icon in the top right
4. Select "Developer Settings" or "API Keys"
5. Click "Create API Key"
6. Copy the API key (it will look like `sk_live_...`)

### Step 2: Set Up Software App
1. In Whop dashboard, click "Create App"
2. Select "Software" as the app type
3. Fill in your app details:
   - Name: "Don't Get Distracted Extension"
   - Description: "Chrome extension to prevent distraction"
   - Category: Software
4. Upload your app icon if you have one
5. Click "Create App"

### Step 3: Create Product
1. In your app dashboard, click "Products"
2. Click "Create Product"
3. Fill in product details:
   - Name: "Don't Get Distracted Premium"
   - Price: Set to $0 for testing
   - Description: "Premium features for the distraction blocker"
   - Features: List your premium features
4. In the "Advanced Settings", enable "License Keys"
5. Click "Create Product"

### Step 4: Test with Free Product
1. Go to your product page
2. Click "Buy Now" to purchase your free product
3. Complete the checkout process (even though it's free)
4. You'll receive a license key - save this for testing

## 3. Extension Configuration

### Step 1: Update Backend URL
1. Open your `manifest.json` file
2. Update the host permission to your worker URL:
   ```json
   "host_permissions": [
     "https://licensecheckerwhop.your-subdomain.workers.dev/*",
     // ... your other permissions
   ]
   ```

### Step 2: Build Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select your extension folder
5. Your extension should now be loaded

### Step 3: Test Locally
1. Open your extension popup by clicking the extension icon
2. Try entering your test license key
3. Verify that:
   - Valid license shows green "License Active"
   - Invalid license shows red "No Active License"
   - Badge updates correctly in extension icon
   - Content script shows premium badge on web pages

### Step 4: Chrome Web Store Submission Tips
1. Prepare required assets:
   - 128x128 icon
   - Screenshots (1280x800 recommended)
   - Privacy policy
   - Detailed description
2. Create a ZIP file of your extension folder
3. Go to [https://chrome.google.com/webstore/developer/dashboard](https://chrome.google.com/webstore/developer/dashboard)
4. Click "New Item" and upload your ZIP
5. Fill in all required information
6. Submit for review (takes 1-7 days)

## 4. Testing Checklist

### Scenario 1: Valid License Activation
- **Steps**: Enter valid license key → Click "Activate"
- **Expected**: Green "License Active" with masked key, badge shows ✓
- **Verify**: License stored in chrome.storage.local

### Scenario 2: Invalid License
- **Steps**: Enter invalid license key → Click "Activate"
- **Expected**: Red "No Active License" with error message
- **Verify**: No license stored, badge shows !

### Scenario 3: Deactivate License
- **Steps**: With valid license → Click "Deactivate"
- **Expected**: Returns to invalid state, license cleared
- **Verify**: License removed from chrome.storage.local

### Scenario 4: Background License Check
- **Expected**: Extension badge updates on startup
- **Verify**: ✓ for valid, ! for invalid

### Scenario 5: Content Script Integration
- **With valid license**: Premium badge appears on web pages
- **With invalid license**: Upgrade prompt appears (auto-dismisses after 10s)

### Scenario 6: Offline Mode
- **Steps**: Disconnect internet → Check license
- **Expected**: Uses cached license data for 7 days after expiry

### Scenario 7: Periodic Validation
- **Expected**: Background script validates license every 60 minutes
- **Verify**: Check console logs for validation messages

### Scenario 8: Settings Page Protection
- **With valid license**: All settings accessible
- **Without license**: Premium features locked, prompt appears

### Scenario 9: Alert Page Protection
- **With valid license**: Alert shows normally
- **Without license**: License prompt appears instead of alert

### Scenario 10: Extension Installation
- **Expected**: Initial badge state set correctly
- **Verify**: Background script starts periodic checks

## Troubleshooting Tips

1. **Worker not responding**: Check Cloudflare dashboard for errors
2. **API key issues**: Verify WHOP_API_KEY in environment variables
3. **CORS errors**: Ensure worker has proper CORS headers
4. **Storage not working**: Check Chrome extension permissions
5. **Badge not updating**: Verify background script is running

## Security Notes

- Never expose your WHOP_API_KEY in client-side code
- Always validate license server-side
- Use HTTPS for all API communications
- Implement proper rate limiting
- Sanitize all user inputs

This completes your deployment guide. Your license validation system should now be fully operational!