// Import Supabase Client from CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// REPLACE THESE WITH YOUR ACTUAL SUPABASE URL AND ANON KEY
const SUPABASE_URL = 'https://uhywizzvqcacjwtkxukz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeXdpenp2cWNhY2p3dGt4dWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDQxMzYsImV4cCI6MjA5NzIyMDEzNn0.0_NOCHhKi-SQ8iWfr9mab5ZU7d_cLu73PQq_8I2nlik';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
