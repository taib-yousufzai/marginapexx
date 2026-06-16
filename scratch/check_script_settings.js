const url = 'https://cpcvklekwwawgtgbyrmp.supabase.co/rest/v1/script_settings?select=*';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwY3ZrbGVrd3dhd2d0Z2J5cm1wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQwNDI4OSwiZXhwIjoyMDkxOTgwMjg5fQ.1leA-LgFvsOKjCg9rS8V1UZfdO8uCXbf-6cXGQATy24';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
})
.then(res => res.json())
.then(data => {
  console.log('Script Settings in DB:', JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error('Error fetching script settings:', err);
});
