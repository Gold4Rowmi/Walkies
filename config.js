// From Supabase > Project Settings > API, and Google Cloud > Credentials.
// All three are public by design: the database is protected by row-level security,
// and the maps key is restricted to this site's address.
// Never put the Supabase service_role key in this file.
window.WALKIES_CONFIG = {
  SUPABASE_URL: 'https://dialionwiwgjyiiuldtg.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_6RwVkjpCPzP3k9VPgfiuWQ_ZxwH3BTq',
  MAPS_KEY: 'AIzaSyBkk0vlSHTXzMZTfzt9GDSw-eTrfKoutDI',
  VAPID_PUBLIC: 'BPhZZusCDsdc-951elHkX1hGtZYksmwN0SlkSXUOtp51HC5SXKVYxfz3tyTNr3NOQdGja19rjWgHc1-gDUz0AwE',

  // Day 1 of the trip, as YYYY-MM-DD. Every day label is worked out from this.
  TRIP_START: '2027-04-12'
};
