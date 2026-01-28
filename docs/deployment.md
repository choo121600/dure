# GitHub Pages Deployment Guide

This document explains how to deploy this documentation site to GitHub Pages.

## Automatic Deployment (GitHub Actions)

### Step 1: Enable GitHub Pages

1. Go to GitHub repository
2. Click **Settings** > **Pages**
3. In the **Source** section:
   - Source: Select **GitHub Actions**

### Step 2: Push Code

```bash
git add .
git commit -m "docs: Add documentation site"
git push origin main
```

### Step 3: Verify Deployment

1. Check workflow execution in the **Actions** tab
2. Once complete, access `https://yourusername.github.io/dure/`

## Manual Deployment

If not using GitHub Actions:

### Step 1: Create gh-pages Branch

```bash
# Create gh-pages branch
git checkout --orphan gh-pages

# Keep only docs folder contents
git rm -rf .
git add -f docs/*
mv docs/* .
rm -rf docs

# Commit and push
git commit -m "Deploy documentation"
git push origin gh-pages

# Return to main branch
git checkout main
```

### Step 2: GitHub Pages Settings

1. **Settings** > **Pages**
2. **Source**: Select `gh-pages` branch
3. **Folder**: Select `/ (root)`
4. Click **Save**

### Step 3: Access

`https://yourusername.github.io/dure/`

## Custom Domain (Optional)

### Step 1: Purchase Domain

Example: `dure.dev`

### Step 2: DNS Settings

At your domain registrar (GoDaddy, Namecheap, etc.):

**Add A records:**

```
Type: A
Name: @
Value: 185.199.108.153
```

Also add these IPs:
- 185.199.109.153
- 185.199.110.153
- 185.199.111.153

**Add CNAME record (www subdomain):**

```
Type: CNAME
Name: www
Value: yourusername.github.io
```

### Step 3: Create CNAME File

Edit `docs/CNAME` file:

```
dure.dev
```

### Step 4: GitHub Settings

1. **Settings** > **Pages**
2. **Custom domain**: Enter `dure.dev`
3. Check **Enforce HTTPS**

### Step 5: Verify

Wait for DNS propagation (up to 24 hours) then access `https://dure.dev`

## Local Development

To verify documentation locally:

```bash
# Install Docsify CLI
npm install -g docsify-cli

# Run documentation server
docsify serve docs

# Access http://localhost:3000
```

## Updating Documentation

### When Using Automatic Deployment

```bash
# Edit documentation
vi docs/guide/getting-started.md

# Commit and push
git add docs/
git commit -m "docs: Update getting started guide"
git push origin main

# GitHub Actions will deploy automatically
```

### When Using Manual Deployment

```bash
# Edit documentation on main branch
git add docs/
git commit -m "docs: Update getting started guide"
git push origin main

# Switch to gh-pages branch
git checkout gh-pages

# Get docs folder from main
git checkout main -- docs
mv docs/* .
rm -rf docs

# Commit and push
git add .
git commit -m "Deploy updated docs"
git push origin gh-pages

# Return to main
git checkout main
```

## Troubleshooting

### 404 Error

**Symptom:** 404 when accessing GitHub Pages

**Solution:**
1. Check Source in **Settings** > **Pages**
2. Verify the branch is correct (gh-pages or main)
3. Verify the folder is correct (root or docs)

### CSS Not Applied

**Symptom:** Styles are broken

**Solution:**

Check paths in `docs/index.html`:

```html
<!-- Use absolute paths -->
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@4/lib/themes/vue.css">

<!-- Avoid relative paths -->
```

### Custom Domain Not Working

**Symptom:** Cannot access custom domain

**Solution:**
1. Wait for DNS propagation (up to 24 hours)
2. Verify DNS:
   ```bash
   dig dure.dev
   ```
3. Check CNAME file
4. Re-verify GitHub Pages settings

### Images Not Displaying

**Symptom:** Image 404 errors

**Solution:**

Use relative paths:

```markdown
<!-- Good -->
![Architecture](../assets/architecture.png)

<!-- Bad -->
![Architecture](/assets/architecture.png)
```

## Advanced Settings

### Adding Analytics

To add Google Analytics, edit `docs/index.html`:

```html
<script>
  window.$docsify = {
    // ... existing settings
    plugins: [
      function(hook, vm) {
        hook.doneEach(function() {
          if (typeof gtag === 'function') {
            gtag('config', 'G-XXXXXXXXXX', {
              'page_path': vm.route.path
            });
          }
        });
      }
    ]
  }
</script>

<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Search Engine Optimization (SEO)

Meta tags in `docs/index.html`:

```html
<head>
  <meta charset="UTF-8">
  <title>Dure - Agentic Software Engineering</title>
  <meta name="description" content="Enter your intent, four agents run sequentially, and humans only make decisions based on evidence">
  <meta name="keywords" content="dure, ai, agents, code generation, automation">
  <meta property="og:title" content="Dure">
  <meta property="og:description" content="Agentic Software Engineering System">
  <meta property="og:image" content="https://yourusername.github.io/dure/assets/og-image.png">
  <meta property="og:url" content="https://yourusername.github.io/dure/">
  <meta name="twitter:card" content="summary_large_image">
</head>
```

### Dark Mode

Docsify automatically supports dark mode. Theme selection:

```html
<!-- Light -->
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@4/lib/themes/vue.css">

<!-- Dark -->
<link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify@4/lib/themes/dark.css">

<!-- Auto (follows system settings) -->
<style>
  @media (prefers-color-scheme: dark) {
    /* Dark mode styles */
  }
</style>
```

## Learn More

- [GitHub Pages Official Documentation](https://docs.github.com/pages)
- [Docsify Official Documentation](https://docsify.js.org/)
- [Custom Domain Setup](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site)
