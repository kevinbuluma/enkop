-- Point the master's drain cron at the public apex host.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enkop-master-drain') THEN
    PERFORM cron.unschedule('enkop-master-drain');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule('enkop-master-drain', '*/5 * * * *', $job$
      select net.http_post(url := 'https://enkoprealestate.com/api/public/enkop-master/drain', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb)
    $job$);
  END IF;
END $$;
