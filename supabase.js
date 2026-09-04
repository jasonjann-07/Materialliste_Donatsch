import { createClient } from '@supabase/supabase-js';
2
 
3
export const supabase = createClient(
4
'https://jfijrtcnqwupgmosjale.supabase.co',
5
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmaWpydGNucXd1cGdtb3NqYWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MjMxOTQsImV4cCI6MjEwNDA5OTE5NH0.tx1QnvmqAj9czw0iL5nw_TOBPfk2r_eKGDidg4DCrhY
6
);