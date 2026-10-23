/** Aggregate only explicitly consented public activity; never infer visits or citywide popularity. */
export const localTrendsQuery=`SELECT v.id,v.name,v.category,v.district,count(DISTINCT l.user_id)::int AS accounts
 FROM post_likes l JOIN users u ON u.id=l.user_id AND u.suspended_at IS NULL
 JOIN user_preferences consent ON consent.user_id=u.id AND consent.share_activity
 JOIN posts p ON p.id=l.post_id AND p.status='published' AND p.user_id<>l.user_id
 LEFT JOIN user_media m ON m.id=p.media_id
 JOIN places v ON v.id=p.place_id AND v.status='published' AND v.verification_status='verified' AND v.activity_status='operating'
 LEFT JOIN businesses b ON b.id=v.business_id
 WHERE l.created_at BETWEEN now()-interval '7 days' AND now()
 AND (p.media_id IS NULL OR m.status='approved') AND (b.owner_id IS NULL OR b.owner_id<>l.user_id)
 AND v.verified_at BETWEEN now()-interval '30 days' AND now()
 AND ($1::text='' OR v.district=$1) AND ($2::text='' OR v.category=$2 OR EXISTS(SELECT 1 FROM place_categories pc WHERE pc.place_id=v.id AND pc.category_slug=$2))
 GROUP BY v.id HAVING count(DISTINCT l.user_id)>=3 ORDER BY accounts DESC,v.name,v.id LIMIT 6`;
