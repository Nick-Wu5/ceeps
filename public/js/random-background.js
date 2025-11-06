// Random background image loader
// Sets a random background image from the public/images folder

document.addEventListener('DOMContentLoaded', () => {
  loadRandomBackground();
});

async function loadRandomBackground() {
  try {
    const response = await fetch('/api/random-background');
    const data = await response.json();
    
    if (data.image) {
      const body = document.body;
      body.style.backgroundImage = `url('${data.image}')`;
      body.style.backgroundRepeat = 'no-repeat';
      body.style.backgroundPosition = 'center center';
      body.style.backgroundAttachment = 'fixed';
      body.style.backgroundSize = 'cover';
    }
  } catch (error) {
    console.error('Failed to load random background:', error);
    // Fallback to default background
    const body = document.body;
    body.style.backgroundImage = "url('images/home_background.jpeg')";
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundPosition = 'center center';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundSize = 'cover';
  }
}

