/** Pure SQL kept separate so consent, timing and deduplication are tested on PostgreSQL. */
export const enqueuePushJobs=`
 INSERT INTO push_deliveries(subscription_id,kind,source_id,source_version)
 SELECT s.id,'event',e.id,e.starts_at::text
 FROM push_subscriptions s JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_events
 JOIN event_favorites f ON f.user_id=s.user_id JOIN events e ON e.id=f.event_id
 WHERE e.status='published' AND e.starts_at>now() AND e.starts_at<=now()+interval '1 hour'
 UNION ALL
 SELECT s.id,'news',n.id,n.published_at::text
 FROM push_subscriptions s JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_news
 JOIN news n ON n.status='published' AND n.published_at>=s.created_at
 WHERE n.published_at<=now() AND n.published_at>now()-interval '15 minutes'
 ON CONFLICT DO NOTHING`;
export const pushPayloadQuery=`
 SELECT e.title, e.venue AS body, '/?event='||e.id::text AS url, u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_events
 JOIN event_favorites f ON f.user_id=s.user_id
 JOIN events e ON e.id=f.event_id AND e.id=$2
 WHERE s.id=$1 AND $3='event' AND e.status='published' AND e.starts_at::text=$4
 AND e.starts_at>now() AND e.starts_at<=now()+interval '1 hour'
 UNION ALL
 SELECT n.title, CASE u.language WHEN 'en' THEN 'New local news' ELSE 'Neue Nachricht aus Frankfurt' END,
 '/?news='||n.id::text, u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_news
 JOIN news n ON n.id=$2 AND n.status='published' AND n.published_at>=s.created_at
 WHERE s.id=$1 AND $3='news' AND n.published_at::text=$4
 AND n.published_at<=now() AND n.published_at>now()-interval '15 minutes'`;
