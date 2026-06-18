require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  try {
    const machineId = 1;
    
    // Check machine status
    const { data: machine, error: getErr } = await supabase
      .from('machines')
      .select('*')
      .eq('id', machineId)
      .single();
    if (getErr) throw getErr;
    console.log('Machine before release:', { id: machine.id, status: machine.status, current_user_id: machine.current_user_id });

    // Release machine
    console.log('Attempting machines update...');
    const { data: updateData, error: machineErr } = await supabase
      .from('machines')
      .update({ status: 'available', current_user_id: null, session_end_time: null })
      .eq('id', machineId)
      .select();
    if (machineErr) {
      console.error('Supabase Machines Update Error:', machineErr);
    } else {
      console.log('Supabase Machines Update Success:', updateData);
    }

    // Update rental status
    console.log('Attempting rentals update...');
    const { data: rentalData, error: rentalErr } = await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('machine_id', machineId)
      .eq('status', 'active')
      .select();
    if (rentalErr) {
      console.error('Supabase Rentals Update Error:', rentalErr);
    } else {
      console.log('Supabase Rentals Update Success:', rentalData);
    }
  } catch (err) {
    console.error('Error running test:', err);
  }
}

run();
