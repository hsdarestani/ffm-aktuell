/** Pure SQL kept separate so consent, timing and deduplication are tested on PostgreSQL. */
export const enqueuePushJobs=`
 INSERT INTO push_deliveries(subscription_id,kind,source_id,source_version)
 SELECT s.id,'event',e.id,e.starts_at::text
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_events
 JOIN event_favorites f ON f.user_id=s.user_id JOIN events e ON e.id=f.event_id
 WHERE e.status='published' AND e.starts_at>now() AND e.starts_at<=now()+interval '1 hour'
 UNION ALL
 SELECT s.id,'news',n.id,n.published_at::text
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_news
 JOIN news n ON n.status='published' AND n.published_at>=s.created_at
 WHERE n.published_at<=now() AND n.published_at>now()-interval '15 minutes'
 UNION ALL
 SELECT s.id,'offer',d.id,d.published_at::text
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_offers
 JOIN deals d ON d.status='published' AND d.published_at>=s.created_at
 JOIN businesses b ON b.id=d.business_id AND b.status='approved'
 WHERE d.published_at<=now() AND d.published_at>now()-interval '15 minutes' AND (d.valid_until IS NULL OR d.valid_until>now())
 UNION ALL
 SELECT s.id,'following',po.id,po.published_at::text
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_following
 JOIN business_follows f ON f.follower_id=s.user_id JOIN businesses b ON b.id=f.business_id AND b.status='approved'
 JOIN places v ON v.business_id=b.id AND v.status='published' JOIN posts po ON po.place_id=v.id AND po.status='published'
 WHERE po.published_at>=s.created_at AND po.published_at>=f.created_at AND po.published_at<=now() AND po.published_at>now()-interval '15 minutes'
 UNION ALL
 SELECT s.id,'tip',t.id,t.publish_at::text
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_tips
 JOIN discovery_tips t ON t.published AND t.publish_at>=s.created_at
 JOIN places v ON v.id=t.place_id AND v.status='published' AND v.verification_status='verified' AND v.activity_status='operating'
 AND v.verified_at BETWEEN now()-interval '30 days' AND now()
 WHERE t.publish_at<=now() AND t.publish_at>now()-interval '15 minutes' AND t.expires_at>now()
 AND (cardinality(p.interests)=0 AND cardinality(p.districts)=0 OR v.category=ANY(p.interests) OR v.district=ANY(p.districts))
 ON CONFLICT DO NOTHING`;
export const pushPayloadQuery=`
 SELECT e.title, e.venue AS body, '/?event='||e.id::text AS url, u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_events
 JOIN event_favorites f ON f.user_id=s.user_id
 JOIN events e ON e.id=f.event_id AND e.id=$2
 WHERE s.id=$1 AND $3='event' AND e.status='published' AND e.starts_at::text=$4
 AND e.starts_at>now() AND e.starts_at<=now()+interval '1 hour'
 UNION ALL
 SELECT n.title, CASE u.language WHEN 'en' THEN 'New local news' ELSE 'Neue Nachricht aus Frankfurt' END,
 '/?news='||n.id::text, u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_news
 JOIN news n ON n.id=$2 AND n.status='published' AND n.published_at>=s.created_at
 WHERE s.id=$1 AND $3='news' AND n.published_at::text=$4
 AND n.published_at<=now() AND n.published_at>now()-interval '15 minutes'
 UNION ALL
 SELECT d.title,b.name,'/?offer='||d.id::text,u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_offers
 JOIN deals d ON d.id=$2 AND d.status='published' JOIN businesses b ON b.id=d.business_id AND b.status='approved'
 WHERE s.id=$1 AND $3='offer' AND d.published_at::text=$4 AND d.published_at>=s.created_at
 AND d.published_at<=now() AND d.published_at>now()-interval '15 minutes' AND (d.valid_until IS NULL OR d.valid_until>now())
 UNION ALL
 SELECT b.name,CASE u.language WHEN 'en' THEN 'New public contribution at a followed business' ELSE 'Neuer öffentlicher Beitrag bei einem gefolgten Unternehmen' END,'/?ort='||v.id::text,u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_following
 JOIN posts po ON po.id=$2 AND po.status='published' JOIN places v ON v.id=po.place_id AND v.status='published'
 JOIN businesses b ON b.id=v.business_id AND b.status='approved' JOIN business_follows f ON f.business_id=b.id AND f.follower_id=s.user_id
 WHERE s.id=$1 AND $3='following' AND po.published_at::text=$4 AND po.published_at>=s.created_at AND po.published_at>=f.created_at
 AND po.published_at<=now() AND po.published_at>now()-interval '15 minutes'
 UNION ALL
 SELECT t.title,t.body,'/?ort='||v.id::text,u.language
 FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.suspended_at IS NULL
 JOIN user_preferences p ON p.user_id=s.user_id AND p.notify_tips
 JOIN discovery_tips t ON t.id=$2 AND t.published JOIN places v ON v.id=t.place_id
 WHERE s.id=$1 AND $3='tip' AND t.publish_at::text=$4 AND t.publish_at>=s.created_at
 AND t.publish_at<=now() AND t.publish_at>now()-interval '15 minutes' AND t.expires_at>now()
 AND v.status='published' AND v.verification_status='verified' AND v.activity_status='operating' AND v.verified_at BETWEEN now()-interval '30 days' AND now()
 AND (cardinality(p.interests)=0 AND cardinality(p.districts)=0 OR v.category=ANY(p.interests) OR v.district=ANY(p.districts))`;
