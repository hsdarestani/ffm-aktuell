# FFM Aktuell API contracts

Generated from current executable route branches. Read with [OpenAPI](openapi.json), [A–I end-to-end flows](ACCEPTANCE_A_TO_I.md) and [technical handover](TECHNICAL_HANDOVER.md).

## Common contract

Use same-origin HTTPS with the HttpOnly `ffm_session` cookie. State-changing browser calls are checked against the configured application origin. Never put session/worker/provider secrets in a query string. Authentication, branch ownership, department grants, recent authentication, consent, paid status and current content state are independent checks. Authorization can change between requests. JSON errors normally contain `error`; non-JSON media, calendar and redirect responses follow their handler. Dates, money, rights and source facts are not guessed. Pricing snapshots use integer euro cents; Berlin calendar-day and timezone rules apply where documented. Client redirects never activate benefits.

The OpenAPI structural types are not a substitute for imperative action validation. Every operation below includes the actual authorization, validation and response expressions, including action-specific paths. SQL-enforced row ownership, atomicity and state constraints remain authoritative. These expressions describe implementation and are never executed by the documentation page. Request/response examples for the main workflows are in the A–I acceptance document.

### POST `/api/ad-booking`

Handler: [app/api/ad-booking/route.ts](../app/api/ad-booking/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "campaign_id": {
            "type": "string",
            "format": "uuid"
          },
          "action": {
            "type": "string",
            "enum": [
              "checkout",
              "stop"
            ]
          },
          "accept_terms": {
            "type": "boolean"
          },
          "amount": {
            "type": "integer"
          }
        },
        "required": [
          "campaign_id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
if(!campaign||campaign.status!=='awaiting_commercial_setup'){await tx.query('ROLLBACK');return reply({error:'Inhalt noch nicht freigegeben'},409)}
const rate=(await tx.query('SELECT * FROM ad_rates WHERE placement=$1 FOR SHARE',[campaign.placement])).rows[0];let snapshot;try{snapshot=adSnapshot(campaign,rate||{})}catch{await tx.query('ROLLBACK');return reply({error:'Werbetarif noch nicht freigegeben'},409)}
if(d.accept_terms!==true||d.amount!==snapshot.amount){await tx.query('ROLLBACK');return reply({error:'Aktuellen Gesamtpreis und Bedingungen bestätigen'},409)}
if(snapshot.start_date<=berlinDate()){await tx.query('ROLLBACK');return reply({error:'Buchungen müssen mindestens am Folgetag starten. Bitte neuen Entwurf anlegen.'},409)}
if((await tx.query("SELECT id FROM ad_orders WHERE campaign_id=$1 AND state='paid'",[campaign.id])).rowCount){await tx.query('ROLLBACK');return reply({error:'Bereits bezahlt'},409)}
if(current.status==='complete'){await tx.query("UPDATE ad_orders SET state='processing',payment_intent_id=$2 WHERE id=$1",[old.id,typeof current.payment_intent==='string'?current.payment_intent:current.payment_intent?.id||null]);await tx.query('COMMIT');return reply({error:'Zahlung wird abgeglichen. Keine zweite Buchung starten.'},409)}
if(pending){await tx.query('ROLLBACK');if(pending.state==='processing')return reply({error:'Bankzahlung wird noch verarbeitet. Keine zweite Buchung starten.'},409);return pending.provider_url&&Object.entries(snapshot).every(([key,value])=>pending.snapshot[key]===value)?reply({url:pending.provider_url}):reply({error:'Buchung noch offen. Bitte später erneut versuchen.'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
const d=await req.json().catch(()=>null);if(!z.uuid().safeParse(d?.campaign_id).success)return reply({error:'Kampagne ungültig'},400);
if(current.status==='complete'){await tx.query("UPDATE ad_orders SET state='processing',payment_intent_id=$2 WHERE id=$1",[old.id,typeof current.payment_intent==='string'?current.payment_intent:current.payment_intent?.id||null]);await tx.query('COMMIT');return reply({error:'Zahlung wird abgeglichen. Keine zweite Buchung starten.'},409)}
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Bitte anmelden'},401)
return reply({error:'Kampagne ungültig'},400)
return reply({error:'Inhalt noch nicht freigegeben'},409)
return reply({success:true,notice:'Ausspielung gestoppt. Eine Erstattung erfolgt nach Vertragsbedingungen durch die Abrechnung.'})
return reply({error:'Zahlungsdienst noch nicht eingerichtet'},503)
return reply({error:'Werbetarif noch nicht freigegeben'},409)
return reply({error:'Aktuellen Gesamtpreis und Bedingungen bestätigen'},409)
return reply({error:'Buchungen müssen mindestens am Folgetag starten. Bitte neuen Entwurf anlegen.'},409)
return reply({error:'Bereits bezahlt'},409)
return reply({error:'Zahlung wird abgeglichen. Keine zweite Buchung starten.'},409)
return reply({error:'Bankzahlung wird noch verarbeitet. Keine zweite Buchung starten.'},409)
return reply({url:session.url})
return reply({error:'Werbung konnte nicht gebucht werden'},503)}finally{tx.release()
```

### GET `/api/ad-rates`

Handler: [app/api/ad-rates/route.ts](../app/api/ad-rates/route.ts). Access: **session**.

Authorization and state gates:

```ts
export async function GET(req:NextRequest){const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);return reply({items:(await query('SELECT * FROM ad_rates ORDER BY placement')).rows})}
```

Responses:

```ts
return reply({error:'Bitte anmelden'},401)
return reply({items:(await query('SELECT * FROM ad_rates ORDER BY placement')).rows})
```

### POST `/api/ad-rates`

Handler: [app/api/ad-rates/route.ts](../app/api/ad-rates/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "placement": {
            "type": "string"
          },
          "daily_cents": {
            "type": "integer"
          },
          "approved": {
            "type": "boolean"
          },
          "reason": {
            "type": "string"
          },
          "terms_url": {
            "type": "string",
            "format": "uri"
          }
        },
        "required": [
          "placement",
          "daily_cents",
          "approved",
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u||!canAdmin(u,'finance'))return reply({error:'Finanzberechtigung erforderlich'},403);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u||!canAdmin(u,'finance'))return reply({error:'Finanzberechtigung erforderlich'},403);
const d=await req.json().catch(()=>null);if(!d||!placements.includes(d.placement)||!Number.isSafeInteger(d.daily_cents)||d.daily_cents<1||d.daily_cents>1000000||typeof d.approved!=='boolean'||typeof d.reason!=='string'||d.reason.trim().length<20||d.reason.length>1000||typeof d.terms_url!=='string'||d.terms_url.length>1000||!/^https:\/\//.test(d.terms_url))return reply({error:'Tarif, HTTPS Bedingungen und Entscheidungsgrund erforderlich'},400);
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Finanzberechtigung erforderlich'},403)
return reply({error:'Tarif, HTTPS Bedingungen und Entscheidungsgrund erforderlich'},400)
return reply({success:true})}catch{await tx.query('ROLLBACK')
return reply({error:'Tarif nicht gespeichert'},500)}finally{tx.release()
```

### GET `/api/admin/accounts`

Handler: [app/api/admin/accounts/route.ts](../app/api/admin/accounts/route.ts). Access: **department**.

Query names: `q`.

Authorization and state gates:

```ts
const actor=await sessionUser(req);if(!canAdmin(actor,'moderation'))return reply({error:'Keine Berechtigung'},403);
```

Responses:

```ts
return reply({error:'Keine Berechtigung'},403)
return reply({items:[]})
return reply({items:r.rows})
```

### POST `/api/admin/accounts`

Handler: [app/api/admin/accounts/route.ts](../app/api/admin/accounts/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "action": {
            "type": "string",
            "enum": [
              "suspend",
              "restore"
            ]
          },
          "reason": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          }
        },
        "required": [
          "id",
          "action",
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const actor=await sessionUser(req);if(!actor||!canAdmin(actor,'moderation'))return reply({error:'Keine Berechtigung'},403);
if(!await isRecentlyAuthenticated(req,actor.id))return reply({error:'Bitte innerhalb von fünf Minuten erneut anmelden.'},403);
const data=parsed.data;if(data.id===actor.id)return reply({error:'Das eigene Konto wird hier nicht gesperrt'},409);
if(user.role==='admin'||(user.delegated&&actor.role!=='admin')){await tx.query('ROLLBACK');return reply({error:'Administratorkonto geschützt'},403)}
if(Boolean(user.suspended_at)===(data.action==='suspend')){await tx.query('ROLLBACK');return reply({error:'Kontostatus bereits gesetzt'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const parsed=z.object({id:z.uuid(),action:z.enum(['suspend','restore']),reason:z.string().trim().min(10).max(500)}).safeParse(await req.json().catch(()=>null));
// Both transitions invalidate old sessions: restoring an account never revives a stolen cookie.
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Keine Berechtigung'},403)
return reply({error:'Bitte innerhalb von fünf Minuten erneut anmelden.'},403)
return reply({error:'Konto, Aktion und Begründung prüfen'},400)
return reply({error:'Das eigene Konto wird hier nicht gesperrt'},409)
return reply({error:'Konto nicht gefunden'},404)
return reply({error:'Administratorkonto geschützt'},403)
return reply({error:'Kontostatus bereits gesetzt'},409)
return reply({success:true})
return reply({error:'Kontostatus konnte nicht gespeichert werden'},500)}finally{tx.release()
```

### POST `/api/admin/activate`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string",
            "minLength": 36,
            "maxLength": 100
          },
          "email": {
            "type": "string",
            "format": "email"
          },
          "display_name": {
            "type": "string",
            "minLength": 2,
            "maxLength": 80,
            "x-optional": true
          },
          "password": {
            "type": "string",
            "minLength": 16,
            "maxLength": 128
          }
        },
        "required": [
          "token",
          "email",
          "password"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!invite.rowCount){await client.query('ROLLBACK');return bad('Einladungslink ist ungültig, abgelaufen oder verbraucht.',403)}
if(!created.rowCount){await client.query('ROLLBACK');return bad('E-Mail-Adresse ist bereits vergeben.',409)}
```

Validation expressions:

```ts
if(typeof pw!=='string'||pw.length<16)return bad('Das Passwort muss mindestens 16 Zeichen lang sein.');
if(pw.length>128)return bad('Das Passwort darf höchstens 128 Zeichen lang sein.');
const b=parse(z.object({
if(!invite.rowCount){await client.query('ROLLBACK');return bad('Einladungslink ist ungültig, abgelaufen oder verbraucht.',403)}
if(!created.rowCount){await client.query('ROLLBACK');return bad('E-Mail-Adresse ist bereits vergeben.',409)}
```

Responses:

```ts
return bad('Das Passwort muss mindestens 16 Zeichen lang sein.')
return bad('Das Passwort darf höchstens 128 Zeichen lang sein.')
return bad('Einladungslink ist ungültig, abgelaufen oder verbraucht.',403)
return bad('E-Mail-Adresse ist bereits vergeben.',409)
const response=ok({success:true,role:'admin'},201)
```

### GET `/api/admin/billing`

Handler: [app/api/admin/billing/route.ts](../app/api/admin/billing/route.ts). Access: **department**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!canAdmin(u,'finance'))return NextResponse.json({error:'Finanzberechtigung erforderlich'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Finanzberechtigung erforderlich'},{status:403})
return NextResponse.json({subscriptions:subscriptions.rows,invoices:invoices.rows,credits:credits.rows,ads:ads.rows},{headers:{'Cache-Control':'private,no-store'}})
```

### GET `/api/admin/business-seats`

Handler: [app/api/admin/business-seats/route.ts](../app/api/admin/business-seats/route.ts). Access: **department**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u||!canAdmin(u,'business'))return NextResponse.json({error:'Admin erforderlich'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Admin erforderlich'},{status:403})
return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'private,no-store'}})
```

### POST `/api/admin/business-seats`

Handler: [app/api/admin/business-seats/route.ts](../app/api/admin/business-seats/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "business_id": {
            "type": "string",
            "format": "uuid"
          },
          "seats": {
            "type": "integer"
          },
          "terms_approved": {
            "type": "boolean"
          },
          "reason": {
            "type": "string"
          }
        },
        "required": [
          "business_id",
          "seats",
          "terms_approved",
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const u=await sessionUser(req);if(!u||!canAdmin(u,'business'))return NextResponse.json({error:'Admin erforderlich'},{status:403});
if(d.seats<reserved.rows[0].used){await tx.query('ROLLBACK');return NextResponse.json({error:'Zuerst bestehende Zugänge und Einladungen reduzieren'},{status:409})}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const note=typeof d?.reason==='string'?d.reason.trim():'';
if(!uuid.test(d?.business_id||'')||!Number.isInteger(d.seats)||d.seats<0||d.seats>50||note.length<20||note.length>700||d.terms_approved!==true)
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Admin erforderlich'},{status:403})
return NextResponse.json({error:'Genehmigte Bedingungen, 20 Zeichen Begründung und 0 bis 50 Plätze erforderlich'},{status:400})
return NextResponse.json({error:'Unternehmen nicht freigegeben'},{status:404})
return NextResponse.json({error:'Zuerst bestehende Zugänge und Einladungen reduzieren'},{status:409})
return NextResponse.json({updated:true,seats:d.seats})
return NextResponse.json({error:'Mitarbeiterplätze konnten nicht geändert werden'},{status:500})}finally{tx.release()
```

### GET `/api/admin/campaigns`

Handler: [app/api/admin/campaigns/route.ts](../app/api/admin/campaigns/route.ts). Access: **department**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u||!canAdmin(u,'marketing'))return error('Admin erforderlich',403);
```

Responses:

```ts
return NextResponse.json({items:r.rows,payment_enabled:false,advertising_enabled:false},{headers:{'Cache-Control':'private,no-store'}})
```

### POST `/api/admin/campaigns`

Handler: [app/api/admin/campaigns/route.ts](../app/api/admin/campaigns/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "review",
              "stop"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "note": {
            "type": "string"
          },
          "approve": {
            "type": "boolean"
          }
        },
        "required": [
          "id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return error('Ungültige Anfrage',403);
const u=await sessionUser(req);if(!u||!canAdmin(u,'marketing'))return error('Admin erforderlich',403);
if(!r.rowCount){await tx.query('ROLLBACK');return error('Kampagne nicht mehr offen',409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return error('Ungültige Anfrage',403);
if(data?.action==='stop'&&uuid.test(data.id||'')&&typeof data.note==='string'&&data.note.trim().length>=10&&data.note.length<=1200){
if(!uuid.test(data?.id||'')||typeof data.approve!=='boolean')return error('Prüfentscheidung ungültig');
const note=typeof data.note==='string'?data.note.trim():'';
```

Responses:

```ts
return NextResponse.json({notice:'Ausspielung gestoppt. Abrechnung separat prüfen.'})}catch{await tx.query('ROLLBACK')
```

### GET `/api/admin/candidates`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Query names: `q`, `category`, `state`, `page`.

Authorization and state gates:

```ts
admin(user,'editorial');
```

Validation expressions:

```ts
if(!['unverified','needs_review'].includes(state))return bad('Ungültiger Prüfstatus');
```

Responses:

```ts
return bad('Ungültiger Prüfstatus')
return ok({items:r.rows,total:n.rows[0]?.total||0,limit:25,offset})
```

### GET `/api/admin/content`

Handler: [app/api/admin/content/route.ts](../app/api/admin/content/route.ts). Access: **department**.

Query names: `type`, `status`.

Authorization and state gates:

```ts
const actor=await sessionUser(req);if(!canAdmin(actor))return reply({error:'Keine Berechtigung'},403);
const types=Object.entries(kinds).filter(([,v])=>canAdmin(actor,v[2] as AdminCapability)).map(([k])=>k);
if(!types.includes(type)||!['pending','published','rejected'].includes(state))return reply({error:'Bereich oder Status nicht erlaubt'},403);
```

Validation expressions:

```ts
if(!types.includes(type)||!['pending','published','rejected'].includes(state))return reply({error:'Bereich oder Status nicht erlaubt'},403);
const [table,label]=kinds[type as keyof typeof kinds],time=type==='place'?'updated_at':'created_at';
```

Responses:

```ts
return reply({error:'Keine Berechtigung'},403)
return reply({error:'Bereich oder Status nicht erlaubt'},403)
return reply({types,items:rows.rows})
```

### POST `/api/admin/content`

Handler: [app/api/admin/content/route.ts](../app/api/admin/content/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "post",
              "review",
              "comment",
              "deal",
              "place"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "action": {
            "type": "string",
            "enum": [
              "remove",
              "restore"
            ]
          },
          "reason": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          }
        },
        "required": [
          "type",
          "id",
          "action",
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const actor=await sessionUser(req);const parsed=input.safeParse(await req.json().catch(()=>null));
if(!actor)return reply({error:'Keine Berechtigung'},403);
if(!canAdmin(actor,permission))return reply({error:'Keine Berechtigung'},403);
if((data.action==='restore'&&item.status!=='rejected')||item.status===target){await tx.query('ROLLBACK');return reply({error:'Status hat sich geändert'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const actor=await sessionUser(req);const parsed=input.safeParse(await req.json().catch(()=>null));
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Keine Berechtigung'},403)
return reply({error:'Inhalt, Aktion und Begründung prüfen'},400)
return reply({error:'Keine Berechtigung'},403)
return reply({error:'Inhalt nicht gefunden'},404)
return reply({error:'Status hat sich geändert'},409)
return reply({status:target,notice:target==='pending'?'Zur erneuten Prüfung wiederhergestellt. Noch nicht öffentlich.':'Inhalt ausgeblendet.'})
return reply({error:'Inhalt konnte nicht geändert werden'},500)}finally{tx.release()
```

### GET `/api/admin/data-quality`

Handler: [app/api/admin/data-quality/route.ts](../app/api/admin/data-quality/route.ts). Access: **department**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return rejected();
```

Validation expressions:

```ts
if(!['candidates','editorial'].includes(scope)||!scopes.includes(kind as typeof scopes[number])||
!Number.isInteger(rawPage)||rawPage<0||rawPage>200)return fail('Ungültiger Filter');
```

Responses:

```ts
return fail('Ungültiger Filter')
return fail('Suche zu lang')
return NextResponse.json({items:rows.rows,total:rows.rows.length>=0?Number((await query(`SELECT count(*)::int AS n FROM places WHERE ${conditions}`,[term])).rows[0]?.n||0)
return NextResponse.json({error:'Datenprüfung nicht erreichbar'},{status:503})
```

### POST `/api/admin/dispute-place`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "reason": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          }
        },
        "required": [
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'editorial');
```

Validation expressions:

```ts
const b=parse(z.object({id,reason:text(500)}),await payload(req));
if(!r.rowCount)return bad('Ort nicht gefunden',404);
```

Responses:

```ts
return bad('Ort nicht gefunden',404)
return ok({success:true})
```

### POST `/api/admin/events`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "description_de": {
            "type": "string",
            "maxLength": 3000,
            "x-optional": true
          },
          "description_en": {
            "type": "string",
            "maxLength": 3000,
            "x-optional": true
          },
          "venue": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "starts_at": {
            "x-validator": "z.iso"
          },
          "ends_at": {
            "anyOf": [
              {
                "x-validator": "z.iso"
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "category": {
            "type": "string",
            "maxLength": 80,
            "x-optional": true
          },
          "organizer": {
            "type": "string",
            "maxLength": 150,
            "x-optional": true
          },
          "price_cents": {
            "anyOf": [
              {
                "type": "integer",
                "minimum": 0,
                "maximum": 100000000
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "price_source_url": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          },
          "source_url": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          },
          "ticket_url": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          }
        },
        "required": [
          "title",
          "venue",
          "starts_at"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'editorial');const b=parse(z.object({
```

Validation expressions:

```ts
const u=admin(user,'editorial');const b=parse(z.object({
if([b.ticket_url,b.source_url,b.price_source_url].some(x=>x&&!allowedUrl(x)))return bad('Invalid source URL');
if(b.ends_at&&Date.parse(b.ends_at)<Date.parse(b.starts_at))return bad('Event end before start');
if(b.price_cents!=null&&!b.price_source_url)return bad('Price requires a verifiable source URL');
```

Responses:

```ts
return bad('Invalid source URL')
return bad('Event end before start')
return bad('Price requires a verifiable source URL')
return ok({id:r.rows[0].id},201)
```

### POST `/api/admin/moderate-review`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "approve": {
            "type": "boolean"
          }
        },
        "required": [
          "approve"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
```

Validation expressions:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
if(!result.rowCount)return bad('Pending review not found',404);
```

Responses:

```ts
return bad('Pending review not found',404)
return ok({success:true})
```

### POST `/api/admin/moderate-review-report`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "reviewed": {
            "type": "boolean"
          }
        },
        "required": [
          "reviewed"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
```

Validation expressions:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
if(!result.rowCount)return bad('Pending review report not found',404);
```

Responses:

```ts
return bad('Pending review report not found',404)
return ok({success:true})
```

### POST `/api/admin/news`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "body_de": {
            "type": "string",
            "maxLength": 10000,
            "x-optional": true
          },
          "body_en": {
            "type": "string",
            "maxLength": 10000,
            "x-optional": true
          },
          "category": {
            "type": "string",
            "maxLength": 80,
            "x-optional": true
          },
          "published_at": {
            "anyOf": [
              {
                "x-validator": "z.iso"
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "source_url": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          }
        },
        "required": [
          "title"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'editorial');const b=parse(z.object({title:text(150),body_de:optionalText(10000),body_en:optionalText(10000),category:optionalText(80),published_at:z.iso.datetime({offset:true}).nullish(),source_url:z.string().max(1000).optional()}),await payload(req));
if(err?.code==='23505')return bad('Already exists',409);
```

Validation expressions:

```ts
const u=admin(user,'editorial');const b=parse(z.object({title:text(150),body_de:optionalText(10000),body_en:optionalText(10000),category:optionalText(80),published_at:z.iso.datetime({offset:true}).nullish(),source_url:z.string().max(1000).optional()}),await payload(req));
if(b.source_url&&!allowedUrl(b.source_url))return bad('Invalid link');
await audit(u,'create','news',r.rows[0].id);return ok({id:r.rows[0].id,published_at:r.rows[0].published_at,scheduled:Date.parse(String(r.rows[0].published_at))>Date.now()},201);
return bad('Not found',404);
if(err?.code==='23505')return bad('Already exists',409);
const status=err?.status||(/Invalid|fields|JSON/.test(err?.message||'')?400:500);
return bad(status>=500?'Temporary server error':(err?.message||'Request failed'),status);
```

Responses:

```ts
return bad('Invalid link')
return ok({id:r.rows[0].id,published_at:r.rows[0].published_at,scheduled:Date.parse(String(r.rows[0].published_at))>Date.now()},201)
return bad('Not found',404)
return bad('Already exists',409)
return bad(status>=500?'Temporary server error':(err?.message||'Request failed'),status)
```

### POST `/api/admin/places`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "category": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          },
          "district": {
            "type": "string",
            "maxLength": 100,
            "x-optional": true
          },
          "description_de": {
            "type": "string",
            "maxLength": 2000,
            "x-optional": true
          },
          "description_en": {
            "type": "string",
            "maxLength": 2000,
            "x-optional": true
          },
          "address": {
            "type": "string",
            "maxLength": 200,
            "x-optional": true
          },
          "latitude": {
            "anyOf": [
              {
                "type": "number",
                "maximum": 90
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "longitude": {
            "anyOf": [
              {
                "type": "number",
                "maximum": 180
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "website": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          },
          "source_url": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          }
        },
        "required": [
          "name",
          "category"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'editorial');
```

Validation expressions:

```ts
const b=parse(z.object({name:text(150),category:text(80),district:optionalText(100),description_de:optionalText(2000),description_en:optionalText(2000),address:optionalText(200),latitude:z.number().min(-90).max(90).nullish(),longitude:z.number().min(-180).max(180).nullish(),website:z.string().max(1000).optional(),source_url:z.string().max(1000).optional()}),await payload(req));
if((b.website&&!allowedUrl(b.website))||(b.source_url&&!allowedUrl(b.source_url)))return bad('Invalid URL');
```

Responses:

```ts
return bad('Invalid URL')
return ok({id:r.rows[0].id},201)
```

### POST `/api/admin/plans`

Handler: [app/api/admin/plans/route.ts](../app/api/admin/plans/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "save",
              "approve",
              "withdraw"
            ]
          },
          "title_de": {
            "type": "string"
          },
          "title_en": {
            "type": "string"
          },
          "monthly_price_cents": {
            "type": [
              "integer",
              "null"
            ]
          },
          "annual_price_cents": {
            "type": [
              "integer",
              "null"
            ]
          },
          "features": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "trial_days": {
            "type": "integer"
          },
          "staff_seats": {
            "type": "integer"
          },
          "branch_limit": {
            "type": "integer"
          },
          "legal_terms_url": {
            "type": "string",
            "format": "uri"
          },
          "approval_note": {
            "type": "string"
          },
          "explicit_price_approval": {
            "type": "boolean"
          }
        },
        "required": [
          "code",
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
const u=await sessionUser(req);if(!u||!canAdmin(u,'finance'))return fail('Admin erforderlich',403);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
if(!d||!codes.includes(d.code)||!['save','approve','withdraw'].includes(d.action))return fail('Planaktion ungültig');
const titleDe=typeof d.title_de==='string'?d.title_de.trim():'',titleEn=typeof d.title_en==='string'?d.title_en.trim():'';
const validPrice=(x:unknown)=>x===null||(typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=10000000);
!Array.isArray(d.features)||d.features.length>features.length||d.features.some((v:unknown)=>typeof v!=='string'||!features.includes(v))||
await tx.query('ROLLBACK');return fail('Preise, Vorteile oder Probezeit ungültig');
if(!Number.isInteger(seats)||seats<0||seats>50||!Number.isInteger(branches)||branches<1||branches>100){await tx.query('ROLLBACK');return fail('Mitarbeiter oder Standortlimit ungültig')}
const terms=typeof d.legal_terms_url==='string'?d.legal_terms_url.trim():'';
const note=typeof d.approval_note==='string'?d.approval_note.trim():'';
```

Responses:

```ts
return fail('Ungültige Herkunft',403)
return fail('Admin erforderlich',403)
return fail('Planaktion ungültig')
return fail('Plan nicht gefunden',404)
return fail('Preise, Vorteile oder Probezeit ungültig')
return fail('Mitarbeiter oder Standortlimit ungültig')
return fail('Nur HTTPS Vertragsbedingungen erlaubt')
return fail('Offizielle Tarifentscheidung mit Quelle und mindestens 25 Zeichen erforderlich')
return fail('Noch kein bestätigter monatlicher Preis oder gültige AGB hinterlegt')
return NextResponse.json({success:true,code:d.code,status:d.action==='approve'?'approved_for_display':'draft',checkout_available:false})
return fail('Tarif konnte nicht gespeichert werden',500)}finally{tx.release()
```

### GET `/api/admin/queue`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Authorization and state gates:

```ts
admin(user);const [b,c,p,d,posts,reports,reviews,reviewReports,comments,branchChanges]=await Promise.all([
]);return ok({businesses:canAdmin(user,'business')?b.rows:[],claims:canAdmin(user,'business')?c.rows:[],places:canAdmin(user,'editorial')?p.rows:[],deals:canAdmin(user,'marketing')?d.rows:[],posts:canAdmin(user,'moderation')?posts.rows:[],reports:canAdmin(user,'moderation')?reports.rows:[],reviews:canAdmin(user,'moderation')?reviews.rows:[],reviewReports:canAdmin(user,'moderation')?reviewReports.rows:[],comments:canAdmin(user,'moderation')?comments.rows:[],branchChanges:canAdmin(user,'business')?branchChanges.rows:[]});
```

Responses:

```ts
return ok({businesses:canAdmin(user,'business')?b.rows:[],claims:canAdmin(user,'business')?c.rows:[],places:canAdmin(user,'editorial')?p.rows:[],deals:canAdmin(user,'marketing')?d.rows:[],posts:canAdmin(user,'moderation')?posts.rows:[],reports:canAdmin(user,'moderation')?reports.rows:[],reviews:canAdmin(user,'moderation')?reviews.rows:[],reviewReports:canAdmin(user,'moderation')?reviewReports.rows:[],comments:canAdmin(user,'moderation')?comments.rows:[],branchChanges:canAdmin(user,'business')?branchChanges.rows:[]})
```

### POST `/api/admin/remove-review`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "reason": {
            "type": "string",
            "minLength": 10,
            "maxLength": 300
          }
        },
        "required": [
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
```

Validation expressions:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
if(!r.rowCount)return bad('Published review not found',404);
```

Responses:

```ts
return bad('Published review not found',404)
return ok({success:true})
```

### POST `/api/admin/review`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "business",
              "claim",
              "place",
              "deal",
              "post",
              "comment"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "approve": {
            "type": "boolean"
          }
        },
        "required": [
          "type",
          "id",
          "approve"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
admin(user,b.type==='business'||b.type==='claim'?'business':b.type==='place'?'editorial':b.type==='deal'?'marketing':'moderation');
if(!company.rowCount){await tx.query('ROLLBACK');return bad('Approve business first',409)}
if(!place||place.business_id&&place.business_id!==claim.business_id){await tx.query('ROLLBACK');return bad('Already owned',409)}
if(Number(capacity.rows[0].used)>=capacity.rows[0].capacity){await tx.query('ROLLBACK');return bad('Standortlimit des Tarifs erreicht',409)}
if(b.type==='deal'&&b.approve){const allowed=await query('SELECT id FROM deals WHERE id=$1 AND business_deal_access(business_id,place_id)',[b.id]);if(!allowed.rowCount)return bad('Aktives Unternehmens Premium und freigegebener Standort erforderlich',409);}
```

Validation expressions:

```ts
const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
if(!claim){await tx.query('ROLLBACK');return bad('Claim not found',404)}
if(!company.rowCount){await tx.query('ROLLBACK');return bad('Approve business first',409)}
if(!place||place.business_id&&place.business_id!==claim.business_id){await tx.query('ROLLBACK');return bad('Already owned',409)}
if(Number(capacity.rows[0].used)>=capacity.rows[0].capacity){await tx.query('ROLLBACK');return bad('Standortlimit des Tarifs erreicht',409)}
if(!r.rowCount)return bad('Not found',404);
```

Responses:

```ts
return bad('Claim not found',404)
return bad('Approve business first',409)
return bad('Already owned',409)
return bad('Standortlimit des Tarifs erreicht',409)
return ok({success:true})
return bad('Aktives Unternehmens Premium und freigegebener Standort erforderlich',409)
return bad('Not found',404)
return ok({success:true})
```

### POST `/api/admin/review-candidate`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "action": {
                "const": "publish"
              },
              "osm_id": {
                "type": "string",
                "x-validation-expression": "z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$'))"
              },
              "verification_source": {
                "type": "string",
                "format": "uri",
                "maxLength": 1000
              },
              "verification_method": {
                "type": "string",
                "enum": [
                  "betreiber_webseite",
                  "betreiber_kontakt",
                  "behoerde"
                ]
              },
              "verification_note": {
                "type": "string",
                "minLength": 25,
                "maxLength": 2000
              },
              "confirms_existence": {
                "x-validator": "z"
              },
              "confirms_address": {
                "x-validator": "z"
              },
              "confirms_operation": {
                "x-validator": "z"
              },
              "editorial_rank": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "x-optional": true
              },
              "opening_hours_text": {
                "type": "string",
                "maxLength": 300,
                "x-optional": true
              }
            },
            "required": [
              "action",
              "osm_id",
              "verification_source",
              "verification_method",
              "verification_note",
              "confirms_existence",
              "confirms_address",
              "confirms_operation"
            ]
          },
          {
            "type": "object",
            "properties": {
              "action": {
                "type": "string",
                "enum": [
                  "hide",
                  "needs_review"
                ]
              },
              "osm_id": {
                "type": "string",
                "x-validation-expression": "z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$'))"
              },
              "reason": {
                "type": "string",
                "minLength": 10,
                "maxLength": 500
              }
            },
            "required": [
              "action",
              "osm_id",
              "reason"
            ]
          }
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'editorial');
```

Validation expressions:

```ts
const b=parse(z.discriminatedUnion('action',[
if(b.action==='publish'&&!proof)return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich');
```

Responses:

```ts
return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich')
return ok({success:true,id:inserted.rows[0].id,verified:true})
return ok({success:true,verified:false})
```

### POST `/api/admin/review-place-change`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "approve": {
            "type": "boolean"
          },
          "note": {
            "type": "string",
            "maxLength": 500,
            "x-optional": true
          }
        },
        "required": [
          "approve"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'business');
if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
```

Validation expressions:

```ts
const b=parse(z.object({id,approve:z.boolean(),note:z.string().trim().max(500).optional().default('')}),await payload(req));
const change=request.rows[0];if(!change){await tx.query('ROLLBACK');return bad('Request not found',404)}
if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
```

Responses:

```ts
return bad('Request not found',404)
return bad('Business or location no longer authorized',409)
return ok({success:true,status:b.approve?'approved':'rejected'})
```

### POST `/api/admin/review-report`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "reviewed": {
            "type": "boolean"
          }
        },
        "required": [
          "reviewed"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
```

Validation expressions:

```ts
const u=admin(user,'moderation');const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
if(!r.rowCount)return bad('Report not found',404);
```

Responses:

```ts
return bad('Report not found',404)
return ok({success:true})
```

### GET `/api/admin/roles`

Handler: [app/api/admin/roles/route.ts](../app/api/admin/roles/route.ts). Access: **department**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(u?.role!=='admin')return reply({error:'Hauptadministrator erforderlich'},403);
```

Responses:

```ts
return reply({error:'Hauptadministrator erforderlich'},403)
return reply({roles:roles.rows,assignments:assignments.rows,capabilities:ADMIN_CAPABILITIES})
```

### POST `/api/admin/roles`

Handler: [app/api/admin/roles/route.ts](../app/api/admin/roles/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "role",
              "assign",
              "revoke"
            ]
          },
          "code": {
            "type": "string",
            "x-validation-expression": "z.string().regex(/^[a-z_]{2,40}$/)"
          },
          "email": {
            "type": "string",
            "format": "email",
            "maxLength": 254,
            "x-optional": true
          },
          "label": {
            "type": "string",
            "minLength": 2,
            "maxLength": 80,
            "x-optional": true
          },
          "permissions": {
            "type": "array",
            "items": {
              "x-validator": "z"
            },
            "maxItems": 6,
            "x-optional": true
          },
          "reason": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          }
        },
        "required": [
          "action",
          "code",
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const u=await sessionUser(req);if(u?.role!=='admin')return reply({error:'Hauptadministrator erforderlich'},403);
if(!await isRecentlyAuthenticated(req,u.id))return reply({error:'Für Berechtigungen bitte innerhalb von fünf Minuten erneut anmelden.'},403);
if(target.rows[0].role==='admin'){await tx.query('ROLLBACK');return reply({error:'Hauptadministratoren werden über diesen Bereich nicht geändert'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const parsed=z.object({action:z.enum(['role','assign','revoke']),code:z.string().regex(/^[a-z_]{2,40}$/),email:z.email().max(254).optional(),label:z.string().trim().min(2).max(80).optional(),permissions:z.array(z.enum(ADMIN_CAPABILITIES)).max(6).optional(),reason:z.string().trim().min(10).max(500)}).safeParse(await req.json().catch(()=>null));
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Hauptadministrator erforderlich'},403)
return reply({error:'Für Berechtigungen bitte innerhalb von fünf Minuten erneut anmelden.'},403)
return reply({error:'Rolle, Aktion und Begründung prüfen'},400)
return reply({error:'Name und mindestens ein Bereich erforderlich'},400)
return reply({error:'Registriertes Konto nicht gefunden'},404)
return reply({error:'Hauptadministratoren werden über diesen Bereich nicht geändert'},409)
return reply({error:'Rolle nicht gefunden'},404)
return reply({ok:true})
return reply({error:'Berechtigungen konnten nicht gespeichert werden'},500)}finally{tx.release()
```

### GET `/api/admin/service-status`

Handler: [app/api/admin/service-status/route.ts](../app/api/admin/service-status/route.ts). Access: **department**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u||!canAdmin(u,'operations'))return NextResponse.json({error:'Admin erforderlich'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Admin erforderlich'},{status:403})
```

### GET `/api/admin/validation`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Authorization and state gates:

```ts
admin(user,'editorial');
```

Responses:

```ts
return ok({stats:counts.rows[0],recheck:stale.rows,validity_days:30,opening_now_guaranteed:false})
```

### POST `/api/admin/verify-place`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **department**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "activity_status": {
            "type": "string",
            "enum": [
              "unknown",
              "operating",
              "temporarily_closed",
              "permanently_closed"
            ]
          },
          "verification_source": {
            "type": "string",
            "format": "uri",
            "maxLength": 1000
          },
          "verification_method": {
            "type": "string",
            "enum": [
              "betreiber_webseite",
              "betreiber_kontakt",
              "behoerde"
            ]
          },
          "verification_note": {
            "type": "string",
            "minLength": 25,
            "maxLength": 2000
          },
          "confirms_existence": {
            "x-validator": "z"
          },
          "confirms_address": {
            "x-validator": "z"
          },
          "confirms_status": {
            "x-validator": "z"
          },
          "editorial_rank": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "x-optional": true
          },
          "opening_hours_text": {
            "type": "string",
            "maxLength": 300,
            "x-optional": true
          }
        },
        "required": [
          "activity_status",
          "verification_source",
          "verification_method",
          "verification_note",
          "confirms_existence",
          "confirms_address",
          "confirms_status"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=admin(user,'editorial');
```

Validation expressions:

```ts
const b=parse(z.object({
if(!source)return bad('Unabhängige HTTPS Quelle erforderlich');
if(!r.rowCount)return bad('Ort nicht gefunden',404);
```

Responses:

```ts
return bad('Unabhängige HTTPS Quelle erforderlich')
return bad('Ort nicht gefunden',404)
return ok({success:true,verification_status:'verified'})
```

### GET `/api/advertising`

Handler: [app/api/advertising/route.ts](../app/api/advertising/route.ts). Access: **public or conditional**.

Validation expressions:

```ts
if(!placements.includes(placement as typeof placements[number]))return reply({error:'Anzeigenplatz ungültig'},400);
```

Responses:

```ts
return reply({error:'Anzeigenplatz ungültig'},400)
return reply({items:[]})
return reply({items:[]})
return reply({items:[]})
return reply({items:[{token,title:ad.snapshot.title,body:ad.snapshot.copy_de,place_id:ad.snapshot.place_id,place_name:ad.place_name,business_name:ad.business_name}]})
return reply({items:[]})}finally{tx.release()
```

### POST `/api/advertising`

Handler: [app/api/advertising/route.ts](../app/api/advertising/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$"
          },
          "kind": {
            "type": "string",
            "enum": [
              "impression",
              "click"
            ]
          }
        },
        "required": [
          "token",
          "kind"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const d=await req.json().catch(()=>null);
if(!exposure){await tx.query('ROLLBACK');return reply({error:'Messung abgelaufen'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const d=await req.json().catch(()=>null);
if(!d||!/^([a-f0-9]{64})$/.test(d.token||'')||!['impression','click'].includes(d.kind))return reply({error:'Messung ungültig'},400);
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Messung ungültig'},400)
return reply({error:'Messung abgelaufen'},409)
return reply({recorded:true})
return reply({error:'Messung nicht gespeichert'},500)}finally{tx.release()
```

### POST `/api/auth/login`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "email": {
            "type": "string",
            "format": "email"
          },
          "password": {
            "type": "string"
          }
        },
        "required": [
          "email",
          "password"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!r.rows[0]||!verifyPassword(b.password,r.rows[0].password_hash))return bad('Invalid credentials',401);
```

Validation expressions:

```ts
const b=parse(z.object({email:email,password:z.string()}),await payload(req));
if(!r.rows[0]||!verifyPassword(b.password,r.rows[0].password_hash))return bad('Invalid credentials',401);
```

Responses:

```ts
return bad('Invalid credentials',401)
const res=ok({success:true})
```

### POST `/api/auth/logout`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Authorization and state gates:

```ts
const user=await sessionUser(req);
```

Responses:

```ts
const res=ok({success:true})
```

### GET `/api/auth/oauth/[provider]/callback`

Handler: [app/api/auth/oauth/[provider]/callback/route.ts](../app/api/auth/oauth/[provider]/callback/route.ts). Access: **public or conditional**.

Validation expressions:

```ts
const saved=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as {state:string;nonce:string;verifier:string};
if(!state||!code||state!==saved.state||!saved.nonce||!saved.verifier||code.length>2048)throw Error('Invalid login state');
```

Responses:

```ts
See the handler for non-JSON, redirect, media or shared-helper responses.
```

### POST `/api/auth/oauth/[provider]/callback`

Handler: [app/api/auth/oauth/[provider]/callback/route.ts](../app/api/auth/oauth/[provider]/callback/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/x-www-form-urlencoded": {
      "schema": {
        "type": "object",
        "properties": {
          "state": {
            "type": "string"
          },
          "code": {
            "type": "string"
          }
        },
        "required": [
          "state",
          "code"
        ]
      }
    }
  }
}
```

Validation expressions:

```ts
const saved=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as {state:string;nonce:string;verifier:string};
if(!state||!code||state!==saved.state||!saved.nonce||!saved.verifier||code.length>2048)throw Error('Invalid login state');
```

Responses:

```ts
See the handler for non-JSON, redirect, media or shared-helper responses.
```

### GET `/api/auth/oauth/[provider]/start`

Handler: [app/api/auth/oauth/[provider]/start/route.ts](../app/api/auth/oauth/[provider]/start/route.ts). Access: **public or conditional**.

Responses:

```ts
return NextResponse.json({error:'Anmeldung noch nicht eingerichtet'},{status:503})
```

### GET `/api/auth/oauth/status`

Handler: [app/api/auth/oauth/status/route.ts](../app/api/auth/oauth/status/route.ts). Access: **public or conditional**.

Responses:

```ts
return NextResponse.json({google:configured('google'),apple:configured('apple')},{headers:{'Cache-Control':'no-store'}})
```

### GET `/api/auth/phone`

Handler: [app/api/auth/phone/route.ts](../app/api/auth/phone/route.ts). Access: **public or conditional**.

Authorization and state gates:

```ts
export async function GET(req:NextRequest){const u=await sessionUser(req);const linked=u?(await query('SELECT phone FROM phone_identities WHERE user_id=$1',[u.id])).rows[0]?.phone:null;return reply({configured:phoneConfigured(),phone:linked?linked.slice(0,3)+' ••• '+linked.slice(-3):null})}
```

Responses:

```ts
return reply({configured:phoneConfigured(),phone:linked?linked.slice(0,3)+' ••• '+linked.slice(-3):null})
```

### POST `/api/auth/phone`

Handler: [app/api/auth/phone/route.ts](../app/api/auth/phone/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "start",
              "check",
              "unlink"
            ]
          },
          "phone": {
            "type": "string"
          },
          "consent": {
            "type": "boolean"
          },
          "code": {
            "type": "string"
          }
        },
        "required": [
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const d=await req.json().catch(()=>null),u=await sessionUser(req);
if(!u||!await isRecentlyAuthenticated(req,u.id))return reply({error:'Bitte zuerst erneut mit Passwort oder Google/Apple anmelden.'},403);
if(u&&!await isRecentlyAuthenticated(req,u.id)){await tx.query('ROLLBACK');return reply({error:'Bitte zuerst erneut mit Passwort oder Google/Apple anmelden.'},403)}
if(!c||c.used_at||new Date(c.expires_at).getTime()<=Date.now()||c.attempts>=5||!c.provider_sid||(c.purpose==='link'&&(!u||u.id!==c.user_id))||(c.purpose==='login'&&u)){await tx.query('ROLLBACK');return reply({error:'Anfrage abgelaufen oder ungültig'},409)}
if(!u||!await isRecentlyAuthenticated(req,u.id)){await tx.query('COMMIT');return reply({error:'Bitte erneut mit Passwort oder Google/Apple anmelden.'},403)}
if(existing.rowCount&&existing.rows[0].user_id!==u.id){await tx.query('COMMIT');return reply({error:'Nummer kann nicht verknüpft werden.'},409)}
await tx.query('DELETE FROM phone_identities WHERE user_id=$1',[u.id]);const added=await tx.query('INSERT INTO phone_identities(phone,user_id) VALUES($1,$2) ON CONFLICT(phone) DO NOTHING RETURNING user_id',[c.phone,u.id]);if(!added.rowCount){await tx.query('ROLLBACK');return reply({error:'Nummer kann nicht verknüpft werden.'},409)}
if(!account)return reply({error:'Bitte mit Passwort oder Google/Apple anmelden. Telefonzugang vorher im Profil verknüpfen.'},403);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
if(!d||!['start','check','unlink'].includes(d.action))return reply({error:'Aktion ungültig'},400);
if(!token||!/^[a-f0-9]{64}$/.test(token)||!/^\d{4,10}$/.test(d.code||'')){await tx.query('ROLLBACK');return reply({error:'Code ungültig'},400)}
if(!c||c.used_at||new Date(c.expires_at).getTime()<=Date.now()||c.attempts>=5||!c.provider_sid||(c.purpose==='link'&&(!u||u.id!==c.user_id))||(c.purpose==='login'&&u)){await tx.query('ROLLBACK');return reply({error:'Anfrage abgelaufen oder ungültig'},409)}
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Aktion ungültig'},400)
return reply({error:'Bitte zuerst erneut mit Passwort oder Google/Apple anmelden.'},403)
return reply({success:true})
return reply({error:'Telefonanmeldung noch nicht eingerichtet'},503)
return reply({error:'Erlaubte internationale Nummer und Zustimmung zur einmaligen SMS erforderlich.'},400)
return reply({error:'Bitte zuerst erneut mit Passwort oder Google/Apple anmelden.'},403)
return reply({error:'SMS Limit erreicht. Bitte später erneut versuchen.'},429)
return reply({error:'SMS konnte nicht gesendet werden. Bitte später erneut versuchen.'},503)
return reply({error:'SMS konnte nicht gestartet werden.'},503)
const res=reply({success:true,expires_in:600})
return reply({error:'Code ungültig'},400)
return reply({error:'Anfrage abgelaufen oder ungültig'},409)
return reply({error:'Code konnte nicht geprüft werden.'},503)
return reply({error:'Code nicht bestätigt'},400)
return reply({error:'Bitte erneut mit Passwort oder Google/Apple anmelden.'},403)
return reply({error:'Nummer kann nicht verknüpft werden.'},409)
return reply({error:'Nummer kann nicht verknüpft werden.'},409)
return reply({success:true})
return reply({error:'Bitte mit Passwort oder Google/Apple anmelden. Telefonzugang vorher im Profil verknüpfen.'},403)
const res=reply({success:true})
return reply({error:'Telefonanmeldung derzeit nicht möglich'},503)}finally{tx.release()
```

### POST `/api/auth/register`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "email": {
            "type": "string",
            "format": "email"
          },
          "password": {
            "type": "string",
            "minLength": 12,
            "maxLength": 128
          },
          "display_name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          }
        },
        "required": [
          "email",
          "password",
          "display_name"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const found=await query('SELECT id FROM users WHERE email=$1',[b.email.toLowerCase()]);if(found.rowCount)return bad('Email already registered',409);
```

Validation expressions:

```ts
const b=parse(z.object({email:email,password:z.string().min(12).max(128),display_name:text(80)}),await payload(req));
```

Responses:

```ts
return bad('Email already registered',409)
const res=ok({success:true},201)
```

### POST `/api/billing/checkout`

Handler: [app/api/billing/checkout/route.ts](../app/api/billing/checkout/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "enum": [
              "user_premium",
              "business_premium_1",
              "business_premium_2"
            ]
          },
          "interval": {
            "type": "string",
            "enum": [
              "month",
              "year"
            ]
          },
          "business_id": {
            "type": "string",
            "format": "uuid",
            "x-optional": true
          },
          "accept_terms": {
            "x-validator": "z"
          }
        },
        "required": [
          "code",
          "interval",
          "accept_terms"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
let snapshot;try{snapshot=planSnapshot(plan||{},d.interval)}catch{return reply({error:'Tarif noch nicht zur Buchung freigegeben'},409)}
const b=await query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved'",[d.business_id,u.id]);if(!b.rowCount)return reply({error:'Kein freigegebenes eigenes Unternehmen'},403);businessId=b.rows[0].id;
try{if(JSON.stringify(planSnapshot(current||{},d.interval))!==JSON.stringify(snapshot))throw Error('changed')}catch{await tx.query('ROLLBACK');return reply({error:'Tarif wurde geändert. Bitte neu laden.'},409)}
if(businessId&&!(await tx.query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved' FOR SHARE",[businessId,u.id])).rowCount){await tx.query('ROLLBACK');return reply({error:'Unternehmen nicht mehr freigegeben'},403)}
if(live.rowCount){await tx.query('ROLLBACK');return reply({error:'Ein Abo besteht bereits. Bitte über Abo verwalten ändern oder kündigen.'},409)}
if(current.status==='complete'){await tx.query('ROLLBACK');return reply({error:'Bestehende Zahlung wird abgeglichen. Bitte keine zweite Buchung starten.'},409)}
if(pending.rowCount){await tx.query('ROLLBACK');return pending.rows[0].provider_url&&pending.rows[0].price_id===price.id?reply({url:pending.rows[0].provider_url}):reply({error:'Eine Buchung ist noch offen. Bitte abschließen oder nach 35 Minuten erneut versuchen.'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const parsed=z.object({code:z.enum(['user_premium','business_premium_1','business_premium_2']),interval:z.enum(['month','year']),business_id:z.uuid().optional(),accept_terms:z.literal(true)}).safeParse(await req.json().catch(()=>null));
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Bitte anmelden'},401)
return reply({error:'Zahlungsdienst noch nicht eingerichtet'},503)
return reply({error:'Tarif, Laufzeit und Zustimmung zu Bedingungen erforderlich'},400)
return reply({error:'Tarif noch nicht zur Buchung freigegeben'},409)
return reply({error:'Unternehmen auswählen'},400)
return reply({error:'Kein freigegebenes eigenes Unternehmen'},403)
return reply({error:'Privattarif ohne Unternehmen buchen'},400)
return reply({error:'Zahlungsdienst derzeit nicht erreichbar'},503)
return reply({error:'Tarif wurde geändert. Bitte neu laden.'},409)
return reply({error:'Unternehmen nicht mehr freigegeben'},403)
return reply({error:'Ein Abo besteht bereits. Bitte über Abo verwalten ändern oder kündigen.'},409)
return reply({error:'Bestehende Zahlung wird abgeglichen. Bitte keine zweite Buchung starten.'},409)
return reply({url:session.url})
return reply({error:'Buchung konnte nicht gestartet werden. Es wurden keine Rechte freigeschaltet.'},503)}finally{tx.release()
```

### POST `/api/billing/portal`

Handler: [app/api/billing/portal/route.ts](../app/api/billing/portal/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "subscription_id": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const d=await req.json().catch(()=>null);if(typeof d?.subscription_id!=='string')return NextResponse.json({error:'Abo auswählen'},{status:400});
const configuration={business_profile:{headline:'FFM Aktuell Abonnement',terms_of_service_url:owned.snapshot.legal_terms_url},features:{customer_update:{enabled:true,allowed_updates:['address','name','tax_id']},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},...(products.length?{subscription_update:{enabled:true,default_allowed_updates:['price'],proration_behavior:'always_invoice',products}}:{})}} as Parameters<typeof stripe.billingPortal.configurations.create>[0];
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Bitte anmelden'},{status:401})
return NextResponse.json({error:'Zahlungsdienst noch nicht eingerichtet'},{status:503})
return NextResponse.json({error:'Abo auswählen'},{status:400})
return NextResponse.json({error:'Abo nicht gefunden'},{status:404})
return NextResponse.json({url:session.url},{headers:{'Cache-Control':'private,no-store'}})
return NextResponse.json({error:'Aboverwaltung derzeit nicht erreichbar'},{status:503})
```

### GET `/api/billing/status`

Handler: [app/api/billing/status/route.ts](../app/api/billing/status/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
```

Responses:

```ts
return NextResponse.json({error:'Bitte anmelden'},{status:401})
return NextResponse.json({configured:billingConfigured(),subscriptions:subscriptions.rows,invoices:invoices.rows,credits:credits.rows,refunds:refunds.rows},{headers:{'Cache-Control':'private,no-store'}})
```

### POST `/api/billing/webhook`

Handler: [app/api/billing/webhook/route.ts](../app/api/billing/webhook/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "description": "Exact signed Stripe event bytes. Re-serialization invalidates the signature.",
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "data": {
            "type": "object"
          }
        },
        "required": [
          "id",
          "type",
          "data"
        ]
      }
    }
  }
}
```

Validation expressions:

```ts
let event;try{event=stripeClient().webhooks.constructEvent(Buffer.concat(chunks),req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET!)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
```

Responses:

```ts
return NextResponse.json({error:'Not configured'},{status:503})
return NextResponse.json({error:'Missing body'},{status:400})
return NextResponse.json({error:'Too large'},{status:413})}chunks.push(part.value)
return NextResponse.json({error:'Invalid signature'},{status:400})
return NextResponse.json({received:true})}catch{console.error('Billing webhook synchronization failed')
return NextResponse.json({error:'Retry later'},{status:500})
```

### POST `/api/business/coupons/redeem`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "x-validation-expression": "z.string().regex(/^[A-Za-z0-9_-]{24}$/)"
          }
        },
        "required": [
          "code"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'coupon-redeem');const u=need(user),business=await ownBusiness(u);
if(business.status!=='approved')return bad('Business verification pending',403);
if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
```

Validation expressions:

```ts
if(business.status!=='approved')return bad('Business verification pending',403);
const b=parse(z.object({code:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}),await payload(req));
if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
```

Responses:

```ts
return bad('Business verification pending',403)
return bad('Coupon invalid, expired or already redeemed',409)
return ok({success:true,title:r.rows[0].title})
```

### GET `/api/business/insights`

Handler: [app/api/business/insights/route.ts](../app/api/business/insights/route.ts). Access: **session**.

Query names: `business_id`.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
if(!acl.rowCount)return NextResponse.json({error:'Kein Zugriff auf diesen Betrieb'},{status:403});
if(!(await entitlements(u.id,businessId)).features.includes('analytics'))return NextResponse.json({error:'Statistiken sind in Business Premium enthalten.'},{status:402});
```

Validation expressions:

```ts
if(!uuid.test(businessId))return NextResponse.json({error:'Unternehmen auswählen'},{status:400});
if(!(await entitlements(u.id,businessId)).features.includes('analytics'))return NextResponse.json({error:'Statistiken sind in Business Premium enthalten.'},{status:402});
```

Responses:

```ts
return NextResponse.json({error:'Bitte anmelden'},{status:401})
return NextResponse.json({error:'Unternehmen auswählen'},{status:400})
return NextResponse.json({error:'Kein Zugriff auf diesen Betrieb'},{status:403})
return NextResponse.json({error:'Statistiken sind in Business Premium enthalten.'},{status:402})
```

### GET `/api/business/overview`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user),b=await ownBusiness(u);
```

Responses:

```ts
return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows,changes:changes.rows})
```

### POST `/api/business/places/change`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "address": {
            "type": "string",
            "maxLength": 200,
            "x-optional": true
          },
          "website": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          },
          "phone": {
            "type": "string",
            "maxLength": 40,
            "x-optional": true
          },
          "opening_hours_text": {
            "type": "string",
            "maxLength": 300,
            "x-optional": true
          }
        },
        "required": [
          "place_id",
          "name"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=need(user);
if(!business||business.status!=='approved')return bad('Keine Berechtigung für diesen Standort',403);
if(!owned.rowCount)return bad('Place not owned',403);
```

Validation expressions:

```ts
const b=parse(z.object({place_id:id,name:text(150),address:optionalText(200),
if(!business||business.status!=='approved')return bad('Keine Berechtigung für diesen Standort',403);
if(b.phone&&!/^\+?[0-9\s().\-/]{4,40}$/.test(b.phone))return bad('Invalid phone');
const website=allowedUrl(b.website);if(b.website&&!website)return bad('Invalid website');
if(!owned.rowCount)return bad('Place not owned',403);
```

Responses:

```ts
return bad('Keine Berechtigung für diesen Standort',403)
return bad('Invalid phone')
return bad('Invalid website')
return bad('Place not owned',403)
return ok(r.rows[0],201)
```

### GET `/api/business/team`

Handler: [app/api/business/team/route.ts](../app/api/business/team/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return err('Anmeldung erforderlich',401);
```

Responses:

```ts
return NextResponse.json({business:null,members:[],invites:[]})
return NextResponse.json({business:b,members:members.rows,invites:invites.rows,places:places.rows,mail_enabled:deliveryConfigured()},{headers:{'Cache-Control':'private,no-store'}})
```

### POST `/api/business/team`

Handler: [app/api/business/team/route.ts](../app/api/business/team/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "invite",
              "revoke",
              "remove",
              "role",
              "scope"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "user_id": {
            "type": "string",
            "format": "uuid"
          },
          "email": {
            "type": "string",
            "format": "email"
          },
          "role": {
            "type": "string",
            "enum": [
              "viewer",
              "editor"
            ]
          },
          "all_places": {
            "type": "boolean"
          },
          "place_ids": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uuid"
            }
          }
        },
        "required": [
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return err('Ungültige Herkunft',403);
const u=await sessionUser(req);if(!u)return err('Anmeldung erforderlich',401);
const b=owned.rows[0];if(!b||b.status!=='approved'){await tx.query('ROLLBACK');return err('Unternehmen noch nicht freigegeben',403)}
if(valid.rowCount!==placeIds.length){await tx.query('ROLLBACK');return err('Standort gehört nicht zu diesem Unternehmen',403)}
if(members.rows[0].n+pending.rows[0].n>=b.team_seat_limit){await tx.query('ROLLBACK');return err('Keine freigegebenen Mitarbeiterplätze verfügbar',409)}
if(existing.rowCount){await tx.query('ROLLBACK');return err('Einladung für diese E-Mail bereits offen',409)}
if(already.rowCount){await tx.query('ROLLBACK');return err('Die Person ist bereits im Team',409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return err('Ungültige Herkunft',403);
if(!d||!['invite','revoke','remove','role','scope'].includes(d.action))return err('Unbekannte Teamaktion');
if(placeIds.length>100||placeIds.some(v=>typeof v!=='string'||!uuid.test(v))||!allPlaces&&!placeIds.length){await tx.query('ROLLBACK');return err('Mindestens einen gültigen Standort wählen')}
const to=typeof d.email==='string'?d.email.trim().toLowerCase():'';
if(!emailPattern.test(to)||to===u.email.toLowerCase()||!['viewer','editor'].includes(d.role)){await tx.query('ROLLBACK');return err('E-Mail oder Rolle ungültig')}
if(!uuid.test(d.id||'')){await tx.query('ROLLBACK');return err('Einladung ungültig')}
if(!uuid.test(d.user_id||'')){await tx.query('ROLLBACK');return err('Person ungültig')}
if(!['viewer','editor'].includes(d.role)){await tx.query('ROLLBACK');return err('Rolle ungültig')}
```

Responses:

```ts
return NextResponse.json({success:true,notice:mailed?'Einladung per E-Mail versendet.':'Team aktualisiert.'})
```

### GET `/api/business/team/accept`

Handler: [app/api/business/team/accept/route.ts](../app/api/business/team/accept/route.ts). Access: **session**.

Query names: `token`.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return fail('Bitte anmelden',401);
return r.rowCount?NextResponse.json({invite:r.rows[0]},{headers:{'Cache-Control':'private,no-store'}}):fail('Einladung ungültig, abgelaufen oder E-Mail noch nicht bestätigt',403);
```

Validation expressions:

```ts
if(!valid.test(token))return fail('Einladung ungültig');
return r.rowCount?NextResponse.json({invite:r.rows[0]},{headers:{'Cache-Control':'private,no-store'}}):fail('Einladung ungültig, abgelaufen oder E-Mail noch nicht bestätigt',403);
```

Responses:

```ts
return fail('Bitte anmelden',401)
return fail('Einladung ungültig')
```

### POST `/api/business/team/accept`

Handler: [app/api/business/team/accept/route.ts](../app/api/business/team/accept/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          }
        },
        "required": [
          "token"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
const u=await sessionUser(req);if(!u)return fail('Bitte anmelden',401);
if(!inv||inv.status!=='approved'||inv.owner_id===u.id){await tx.query('ROLLBACK');return fail('Einladung nicht gültig',403)}
await tx.query('ROLLBACK');return fail('Nur die Person mit bestätigter E-Mail darf annehmen',403);
if(current.rows[0].n>=inv.team_seat_limit){await tx.query('ROLLBACK');return fail('Alle Mitarbeiterplätze vergeben',409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
const d=await req.json().catch(()=>null);if(!valid.test(d?.token||''))return fail('Einladung ungültig');
```

Responses:

```ts
return fail('Ungültige Herkunft',403)
return fail('Bitte anmelden',401)
return fail('Einladung ungültig')
return fail('Einladung nicht gültig',403)
return fail('Nur die Person mit bestätigter E-Mail darf annehmen',403)
return fail('Alle Mitarbeiterplätze vergeben',409)
return NextResponse.json({joined:true,role:inv.role})
return fail('Einladung konnte nicht angenommen werden',500)
```

### GET `/api/business/team/access`

Handler: [app/api/business/team/access/route.ts](../app/api/business/team/access/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
```

Responses:

```ts
return NextResponse.json({error:'Bitte anmelden'},{status:401})
return NextResponse.json({teams:b.rows,places:places.rows},{headers:{'Cache-Control':'private,no-store'}})
```

### GET `/api/businesses`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
if(method==='GET'&&path==='businesses'){const u=need(user);const r=await query('SELECT * FROM businesses WHERE owner_id=$1 ORDER BY created_at DESC',[u.id]);return ok({items:r.rows});}
```

Responses:

```ts
return ok({items:r.rows})
```

### POST `/api/businesses`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "registry_reference": {
            "type": "string",
            "maxLength": 200,
            "x-optional": true
          }
        },
        "required": [
          "name"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'business');const u=need(user);const b=parse(z.object({name:text(150),registry_reference:optionalText(200)}),await payload(req));
```

Validation expressions:

```ts
rate(req,'business');const u=need(user);const b=parse(z.object({name:text(150),registry_reference:optionalText(200)}),await payload(req));
```

Responses:

```ts
return ok(r.rows[0],201)
```

### GET `/api/campaigns`

Handler: [app/api/campaigns/route.ts](../app/api/campaigns/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return fail('Anmeldung erforderlich',401);
```

Responses:

```ts
return fail('Anmeldung erforderlich',401)
return NextResponse.json({items:rows.rows,checkout_available:false},{headers:{'Cache-Control':'private,no-store'}})
```

### POST `/api/campaigns`

Handler: [app/api/campaigns/route.ts](../app/api/campaigns/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "create",
              "submit",
              "cancel"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "title": {
            "type": "string"
          },
          "copy_de": {
            "type": "string"
          },
          "start_date": {
            "type": "string",
            "format": "date"
          },
          "end_date": {
            "type": "string",
            "format": "date"
          },
          "placement": {
            "type": "string"
          },
          "place_id": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return fail('Ungültige Anfrage',403);
const u=await sessionUser(req);if(!u)return fail('Anmeldung erforderlich',401);
if(!owned.rowCount)return fail('Standort nicht freigegeben oder nicht dein Unternehmen',403);
if(old.status!=='draft'&&data.action==='submit'){await tx.query('ROLLBACK');return fail('Nur Entwürfe können eingereicht werden',409)}
if(data.action==='cancel'&&!['draft','pending_review','awaiting_commercial_setup'].includes(old.status)){await tx.query('ROLLBACK');return fail('Kampagne nicht mehr änderbar',409)}
if(data.action==='submit'&&(old.business_status!=='approved'||old.place_status!=='published'||String(old.start_date).slice(0,10)<new Date().toISOString().slice(0,10))){await tx.query('ROLLBACK');return fail('Unternehmen, Standort oder Zeitraum nicht freigegeben',409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return fail('Ungültige Anfrage',403);
if(!data||!['create','submit','cancel'].includes(data.action))return fail('Aktion ungültig');
const title=typeof data.title==='string'?data.title.trim():'',copy=typeof data.copy_de==='string'?data.copy_de.trim():'';
const start=typeof data.start_date==='string'?data.start_date:'',end=typeof data.end_date==='string'?data.end_date:'';
if(title.length<4||title.length>150||copy.length<10||copy.length>1500||!placements.includes(data.placement)||
!uuid.test(data.place_id||'')||!ymd.test(start)||!ymd.test(end)||
!Number.isFinite(Date.parse(start+'T00:00:00Z'))||!Number.isFinite(Date.parse(end+'T00:00:00Z'))||
(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))>90*86400000)return fail('Kampagnendaten ungültig');
if(!uuid.test(data.id||''))return fail('Kampagne ungültig');
if(data.action==='cancel'&&!['draft','pending_review','awaiting_commercial_setup'].includes(old.status)){await tx.query('ROLLBACK');return fail('Kampagne nicht mehr änderbar',409)}
```

Responses:

```ts
return fail('Ungültige Anfrage',403)
return fail('Anmeldung erforderlich',401)
return fail('Aktion ungültig')
return fail('Kampagnendaten ungültig')
return fail('Standort nicht freigegeben oder nicht dein Unternehmen',403)
return fail('Monatslimit erreicht',429)
return NextResponse.json({item:r.rows[0],notice:'Entwurf gespeichert. Es wurde nichts gebucht oder veröffentlicht.'},{status:201})
return fail('Kampagne ungültig')
return fail('Kampagne nicht gefunden',404)
return fail('Nur Entwürfe können eingereicht werden',409)
return fail('Kampagne nicht mehr änderbar',409)
return fail('Unternehmen, Standort oder Zeitraum nicht freigegeben',409)
return NextResponse.json({id:data.id,status,notice:status==='pending_review'?'Zur redaktionellen Prüfung gesendet. Keine Zahlung oder Ausspielung.':'Kampagne wurde storniert.'})
return fail('Kampagne konnte nicht geändert werden',500)}finally{tx.release()
```

### GET `/api/categories`

Handler: [app/api/categories/route.ts](../app/api/categories/route.ts). Access: **public or conditional**.

Query names: `include_inactive`.

Authorization and state gates:

```ts
const u=await sessionUser(req);
const all=req.nextUrl.searchParams.get('include_inactive')==='1'&&canAdmin(u,'editorial');
```

Responses:

```ts
return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'no-store'}})
```

### POST `/api/categories`

Handler: [app/api/categories/route.ts](../app/api/categories/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "save",
              "status"
            ]
          },
          "slug": {
            "type": "string"
          },
          "active": {
            "type": "boolean"
          },
          "label_de": {
            "type": "string"
          },
          "label_en": {
            "type": "string"
          },
          "parent_slug": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Admin erforderlich'},{status:403});
if(children.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Eine Hauptkategorie mit Unterkategorien kann nicht verschachtelt werden'},{status:409})}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
if(!data||!['save','status'].includes(data.action)||typeof data.slug!=='string'||!code.test(data.slug))return NextResponse.json({error:'Kategorie ungültig'},{status:400});
if(typeof data.active!=='boolean')return NextResponse.json({error:'Status ungültig'},{status:400});
const de=typeof data.label_de==='string'?data.label_de.trim():'',en=typeof data.label_en==='string'?data.label_en.trim():'';
const parentSlug=typeof data.parent_slug==='string'&&data.parent_slug.trim()?data.parent_slug.trim():null;
if(de.length<2||de.length>100||en.length<2||en.length>100||parentSlug===data.slug)return NextResponse.json({error:'Name oder Überkategorie ungültig'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Admin erforderlich'},{status:403})
return NextResponse.json({error:'Kategorie ungültig'},{status:400})
return NextResponse.json({error:'Status ungültig'},{status:400})
return NextResponse.json({error:'Nicht gefunden'},{status:404})
return NextResponse.json({item:r.rows[0]})
return NextResponse.json({error:'Name oder Überkategorie ungültig'},{status:400})
return NextResponse.json({error:'Nur aktive Hauptkategorien als Eltern erlaubt'},{status:400})
return NextResponse.json({error:'Eine Hauptkategorie mit Unterkategorien kann nicht verschachtelt werden'},{status:409})
return NextResponse.json({item:r.rows[0]})
return NextResponse.json({error:'Kategorie konnte nicht gespeichert werden'},{status:500})
```

### GET `/api/categories/places`

Handler: [app/api/categories/places/route.ts](../app/api/categories/places/route.ts). Access: **public or conditional**.

Query names: `q`.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Admin erforderlich'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Admin erforderlich'},{status:403})
return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'no-store'}})
```

### POST `/api/categories/places`

Handler: [app/api/categories/places/route.ts](../app/api/categories/places/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "categories": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 6
          },
          "place_id": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "categories",
          "place_id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Admin erforderlich'},{status:403});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
if(!uuid.test(data?.place_id||'')||!Array.isArray(ids)||ids.length<1||ids.length>8||ids.some((v:unknown)=>typeof v!=='string'||v.length>70)||new Set(ids).size!==ids.length)return NextResponse.json({error:'Ungültige Zuordnung'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Admin erforderlich'},{status:403})
return NextResponse.json({error:'Ungültige Zuordnung'},{status:400})
return NextResponse.json({error:'Ort nicht gefunden'},{status:404})
return NextResponse.json({error:'Kategorie nicht aktiv'},{status:400})
return NextResponse.json({success:true,categories:ids})
return NextResponse.json({error:'Zuordnung konnte nicht gespeichert werden'},{status:500})
```

### POST `/api/claims`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "format": "uuid"
          },
          "note": {
            "type": "string",
            "maxLength": 500,
            "x-optional": true
          }
        },
        "required": [
          "place_id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=need(user),business=await ownBusiness(u);const b=parse(z.object({place_id:id,note:optionalText(500)}),await payload(req));
```

Validation expressions:

```ts
const u=need(user),business=await ownBusiness(u);const b=parse(z.object({place_id:id,note:optionalText(500)}),await payload(req));
```

Responses:

```ts
return ok(r.rows[0],201)
```

### GET `/api/comments`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `post_id`.

Validation expressions:

```ts
const postId=qs.get('post_id')||'';if(!id.safeParse(postId).success)return bad('Invalid post ID');
if(!post.rowCount)return bad('Post not found',404);
```

Responses:

```ts
return bad('Invalid post ID')
return bad('Post not found',404)
return ok({items:r.rows})
```

### POST `/api/comments`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "post_id": {
            "type": "string",
            "format": "uuid"
          },
          "body": {
            "type": "string",
            "minLength": 3,
            "maxLength": 800
          }
        },
        "required": [
          "post_id",
          "body"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'post-comment');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({post_id:id,body:z.string().trim().min(3).max(800)}),await payload(req));
if(!visible.rowCount)return bad('Post not found',404);
```

Responses:

```ts
return bad('Post not found',404)
return ok({id:r.rows[0].id,status:'pending'},201)
```

### GET `/api/content`

Handler: [app/api/content/route.ts](../app/api/content/route.ts). Access: **public or conditional**.

Query names: `id`, `kind`.

Validation expressions:

```ts
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!['event','news'].includes(kind||''))return NextResponse.json({error:'Ungültiger Link'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültiger Link'},{status:400})
return NextResponse.json({item:r.rows[0]||null},{status:r.rows.length?200:404,headers:{'Cache-Control':'no-store'}})
```

### GET `/api/coupons`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
const response=ok({items:r.rows})
```

### POST `/api/coupons/claim`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "deal_id": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "deal_id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'coupon-claim');const u=need(user);
if(!r.rowCount)return bad('Coupon not available',403);
```

Validation expressions:

```ts
const b=parse(z.object({deal_id:id}),await payload(req));
if(!found.rowCount)return bad('Coupon not available',404);
if(!r.rowCount)return bad('Coupon not available',403);
```

Responses:

```ts
return bad('Coupon not available',404)
return bad('Coupon not available',403)
return ok({code:r.rows[0].code,redeemed:Boolean(r.rows[0].redeemed_at)})
```

### GET `/api/deals`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `priority`.

Responses:

```ts
return ok({items:r.rows})
```

### POST `/api/deals`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 150
          },
          "details": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          },
          "place_id": {
            "anyOf": [
              {
                "type": "string",
                "format": "uuid"
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "premium_only": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "string",
                "enum": [
                  "true",
                  "false"
                ]
              }
            ],
            "x-optional": true,
            "x-validation-expression": "z.union([z.boolean(),z.enum(['true','false'])]).optional().default(false).transform(v=>v===true||v==='true')"
          }
        },
        "required": [
          "title"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=need(user);
if(!business||business.status!=='approved')return bad('Business verification pending',403);
if(!entitled.rows[0].allowed)return bad('Für Angebote ist aktives Unternehmens Premium erforderlich.',402);
if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
```

Validation expressions:

```ts
const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish(),premium_only:z.union([z.boolean(),z.enum(['true','false'])]).optional().default(false).transform(v=>v===true||v==='true')}),await payload(req));
if(!business||business.status!=='approved')return bad('Business verification pending',403);
if(!entitled.rows[0].allowed)return bad('Für Angebote ist aktives Unternehmens Premium erforderlich.',402);
```

Responses:

```ts
return bad('Business verification pending',403)
return bad('Für Angebote ist aktives Unternehmens Premium erforderlich.',402)
return bad('Place not owned',403)
return ok(r.rows[0],201)
```

### GET `/api/discovery`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `category`, `q`, `limit`, `offset`, `bbox`, `lat`, `lon`, `radius`.

Validation expressions:

```ts
if(qs.has('bbox')&&!hasBBox)return bad('Ungültiger Kartenausschnitt');
if(nearby&&(!qs.has('lat')||!qs.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<49.7||lat>50.4||lon<8.2||lon>9.1||!Number.isFinite(radius)||radius<0.25||radius>12))return bad('Ungültiger Standort oder Umkreis');
```

Responses:

```ts
return bad('Ungültiger Kartenausschnitt')
return bad('Ungültiger Standort oder Umkreis')
return ok({items:r.rows,total:n.rows[0]?.count||0,limit,offset,source:'© OpenStreetMap-Mitwirkende · ODbL',verified:false,openingNowAvailable:false})
```

### GET `/api/discovery-map`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `bbox`, `category`.

Validation expressions:

```ts
return bad('Kartenausschnitt ungültig');
```

Responses:

```ts
return bad('Kartenausschnitt ungültig')
return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'})
```

### GET `/api/event-favorites`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
return ok({items:r.rows})
```

### POST `/api/event-favorites`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "event_id": {
            "type": "string",
            "format": "uuid"
          },
          "active": {
            "type": "boolean"
          }
        },
        "required": [
          "event_id",
          "active"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'event-favorite');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({event_id:id,active:z.boolean()}),await payload(req));
if(!existing.rowCount)return bad('Event not available',404);
```

Responses:

```ts
return bad('Event not available',404)
return ok({saved:b.active})
```

### GET `/api/events`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Responses:

```ts
return ok({items:r.rows})
```

### GET `/api/explore`

Handler: [app/api/explore/route.ts](../app/api/explore/route.ts). Access: **public or conditional**.

Query names: `q`, `district`, `open_now`, `verified`, `radius`, `lat`, `lon`, `offset`, `place_offset`, `price_max`, `rating_min`.

Validation expressions:

```ts
const openNow=qs.get('open_now')==='1';if(qs.has('open_now')&&!['0','1'].includes(qs.get('open_now')||''))return fail('Öffnungsfilter ungültig');
if(qs.has('verified')&&!['0','1'].includes(qs.get('verified')||''))return fail('Ungültiger Bestätigungsfilter');
if(![1,3,5,10].includes(radius)||nearby&&(
lat<49.7||lat>50.4||lon<8.2||lon>9.1))return fail('Ungültiger Standort oder Radius');
if([offset,placeOffset].some(n=>!Number.isSafeInteger(n)||n<0||n>10000))return fail('Ungültige Seite');
if(features.some(v=>!supported.includes(v))||features.length>4||![0,1,2,3,4].includes(price)||![0,1,2,3,4,5].includes(rating))return fail('Ungültiges Merkmal, Preisniveau oder Bewertung');
```

Responses:

```ts
return fail('Maximal sechs Kategorien wählen')
return fail('Filter zu lang')
return fail('Öffnungsfilter ungültig')
return fail('Ungültiger Bestätigungsfilter')
return fail('Ungültiger Standort oder Radius')
return fail('Ungültige Seite')
return fail('Ungültiges Merkmal, Preisniveau oder Bewertung')
return NextResponse.json({error:'Orte derzeit nicht erreichbar'},{status:503,headers:{'Cache-Control':'no-store'}})
```

### GET `/api/explore/districts`

Handler: [app/api/explore/districts/route.ts](../app/api/explore/districts/route.ts). Access: **public or conditional**.

Responses:

```ts
return NextResponse.json({items:r.rows.map(v=>v.district)},{headers:{'Cache-Control':'public, max-age=0, s-maxage=120'}})
return NextResponse.json({items:[]},{status:503})
```

### GET `/api/favorites`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
return ok({items:[...published.rows,...candidates.rows].map(x=>x.id)})
```

### POST `/api/favorites`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "maxLength": 90,
            "x-validation-expression": "z.string().max(90).refine(validLocationId)"
          },
          "active": {
            "type": "boolean"
          }
        },
        "required": [
          "place_id",
          "active"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),active:z.boolean()}),await payload(req));
if(osmId.test(b.place_id)){
```

Responses:

```ts
return bad('Place not found',404)
return bad('Place not found',404)
return ok({success:true})
```

### GET `/api/favorites/details`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
return ok({items})
```

### GET `/api/follows`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
return ok({people:people.rows,businesses:businesses.rows})
```

### POST `/api/follows`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "target_type": {
            "type": "string",
            "enum": [
              "user",
              "business"
            ]
          },
          "target_id": {
            "type": "string",
            "format": "uuid"
          },
          "active": {
            "type": "boolean"
          }
        },
        "required": [
          "target_type",
          "target_id",
          "active"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'follow');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({
if(b.target_id===u.id)return bad('Cannot follow yourself');
if(!existing.rowCount)return bad('Author not available',404);
if(!existing.rowCount)return bad('Business not available',404);
```

Responses:

```ts
return bad('Cannot follow yourself')
return bad('Author not available',404)
return bad('Business not available',404)
return ok({following:b.active})
```

### GET `/api/health`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Responses:

```ts
return ok({status:'ok',service:'ffm-aktuell'})
```

### GET `/api/highlights`

Handler: [app/api/highlights/route.ts](../app/api/highlights/route.ts). Access: **session**.

Query names: `business_id`, `scope`.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
if(!owned.rowCount)return NextResponse.json({error:'Nicht berechtigt'},{status:403});
```

Validation expressions:

```ts
if(!uuid.test(business))return NextResponse.json({items:[]});
```

Responses:

```ts
return NextResponse.json({items:[]})
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({error:'Nicht berechtigt'},{status:403})
return NextResponse.json({items:granted.rows},{headers:{'Cache-Control':'private,no-store'}})
return NextResponse.json({items:r.rows})
```

### POST `/api/highlights`

Handler: [app/api/highlights/route.ts](../app/api/highlights/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "grant_id": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "grant_id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
if(!r.rowCount)return NextResponse.json({error:'Nicht berechtigt oder Freigabe abgelaufen'},{status:403});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
if(!uuid.test(data?.grant_id||''))return NextResponse.json({error:'Ungültige Freigabe'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({error:'Ungültige Freigabe'},{status:400})
return NextResponse.json({error:'Nicht berechtigt oder Freigabe abgelaufen'},{status:403})
return NextResponse.json({highlight:r.rows[0]},{status:201})
```

### GET `/api/home-layout`

Handler: [app/api/home-layout/route.ts](../app/api/home-layout/route.ts). Access: **public or conditional**.

Responses:

```ts
return NextResponse.json({modules:validHomeLayout(row?.modules)?row.modules:defaultHomeLayout},{headers:{'Cache-Control':'no-store'}})
```

### POST `/api/home-layout`

Handler: [app/api/home-layout/route.ts](../app/api/home-layout/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "modules": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "string"
                },
                "enabled": {
                  "type": "boolean"
                }
              },
              "required": [
                "code",
                "enabled"
              ]
            }
          }
        },
        "required": [
          "modules"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403})
return NextResponse.json({error:'Alle sechs Module mit eindeutiger Reihenfolge und Sichtbarkeit erforderlich'},{status:400})
return NextResponse.json({success:true})}catch{await tx.query('ROLLBACK')
return NextResponse.json({error:'Startseite nicht gespeichert'},{status:500})}finally{tx.release()
```

### POST `/api/internal/maintenance`

Handler: [app/api/internal/maintenance/route.ts](../app/api/internal/maintenance/route.ts). Access: **worker**.

Authorization and state gates:

```ts
if(token.length<32||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401});
```

Responses:

```ts
return NextResponse.json({error:'Unauthorized'},{status:401})
return NextResponse.json({ok:true})
return NextResponse.json({error:'Maintenance failed'},{status:500})}finally{tx.release()
```

### POST `/api/internal/push-tick`

Handler: [app/api/internal/push-tick/route.ts](../app/api/internal/push-tick/route.ts). Access: **worker**.

Authorization and state gates:

```ts
if(expected.length<32||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401});
```

Responses:

```ts
return NextResponse.json({error:'Unauthorized'},{status:401})
return NextResponse.json({enabled:false})
return NextResponse.json({busy:true})
return NextResponse.json({sent,processed:jobs.rowCount})
return NextResponse.json({error:'Worker failed'},{status:500})
```

### GET `/api/location`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `id`.

Validation expressions:

```ts
if(!validLocationId(place_id))return bad('Invalid place ID',400);
if(osmId.test(place_id)){
if(!r.rowCount)return bad('Place not found',404);
if(!r.rowCount)return bad('Place not found',404);
```

Responses:

```ts
return bad('Invalid place ID',400)
return bad('Place not found',404)
return ok({place:r.rows[0]})
return bad('Place not found',404)
return ok({place:r.rows[0]})
```

### GET `/api/lod2-tile`

Handler: [app/api/lod2-tile/route.ts](../app/api/lod2-tile/route.ts). Access: **public or conditional**.

Query names: `x`, `y`.

Responses:

```ts
return NextResponse.json({error:'Kartenausschnitt außerhalb Frankfurt'},{status:400})
return NextResponse.json({...cached.rows[0].data,cached:true},{headers:{'Cache-Control':'public, max-age=3600, stale-while-revalidate=86400'}})
return NextResponse.json({error:'LoD2 ausgelastet'},{status:503,headers:{'Retry-After':'60'}})
return NextResponse.json({...data,cached:false},{headers:{'Cache-Control':data.partial?'no-store':'public, max-age=3600'}})
```

### GET `/api/loyalty`

Handler: [app/api/loyalty/route.ts](../app/api/loyalty/route.ts). Access: **session**.

Query names: `scope`, `business_id`.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
if(!canAdmin(u,'marketing'))return reply({error:'Marketingberechtigung erforderlich'},403);
const b=await query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved'",[id,u.id]);if(!b.rowCount)return reply({error:'Kein Zugriff'},403);
```

Validation expressions:

```ts
const id=req.nextUrl.searchParams.get('business_id');if(!z.uuid().safeParse(id).success)return reply({error:'Unternehmen auswählen'},400);
```

Responses:

```ts
return reply({error:'Bitte anmelden'},401)
return reply({error:'Marketingberechtigung erforderlich'},403)
return reply({programs:r.rows})
return reply({error:'Unternehmen auswählen'},400)
return reply({error:'Kein Zugriff'},403)
return reply({program})
return reply({cards:cards.rows,visits:visits.rows})
```

### POST `/api/loyalty`

Handler: [app/api/loyalty/route.ts](../app/api/loyalty/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "business_id": {
            "type": "string",
            "format": "uuid"
          },
          "goal": {
            "type": "integer",
            "minimum": 2,
            "maximum": 50
          },
          "minimum_hours": {
            "type": "integer",
            "minimum": 1,
            "maximum": 168
          },
          "reward": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          },
          "terms_url": {
            "type": "string",
            "format": "uri",
            "maxLength": 1500,
            "x-validation-expression": "z.url().max(1500).refine(s=>new URL(s).protocol==='https:')"
          }
        },
        "required": [
          "business_id",
          "goal",
          "minimum_hours",
          "reward",
          "terms_url"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
const b=await tx.query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved' FOR UPDATE",[p.business_id,u.id]);if(!b.rowCount){await tx.query('ROLLBACK');return reply({error:'Kein freigegebenes eigenes Unternehmen'},403)}
if(!canAdmin(u,'marketing'))return reply({error:'Marketingberechtigung erforderlich'},403);
if(place.owner_id===u.id||staff.rowCount){await tx.query('ROLLBACK');return reply({error:'Keine eigenen Besuche für den Betrieb bestätigen lassen'},403)}
if(!card.rowCount){await tx.query('ROLLBACK');return reply({error:'Vorteil noch nicht einlösbar'},409)}
if(recent.rowCount){await tx.query('ROLLBACK');return reply({error:'Mindestabstand zum letzten bestätigten Besuch noch nicht erreicht'},409)}
if(!request){await tx.query('ROLLBACK');return reply({error:'Code ungültig, abgelaufen oder bereits verwendet'},409)}
if(!company||company.id!==request.business_id||company.status!=='approved'||request.user_id===u.id){await tx.query('ROLLBACK');return reply({error:'Kein Bestätigungsrecht an diesem Standort'},403)}
if(!card||visits<card.goal){await tx.query('ROLLBACK');return reply({error:'Vorteil bereits eingelöst oder noch nicht erreicht'},409)}
if(recent.rowCount){await tx.query('ROLLBACK');return reply({error:'Mindestabstand zum letzten bestätigten Besuch noch nicht erreicht'},409)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const v=z.object({business_id:z.uuid(),goal:z.number().int().min(2).max(50),minimum_hours:z.number().int().min(1).max(168),reward:z.string().trim().min(10).max(500),terms_url:z.url().max(1500).refine(s=>new URL(s).protocol==='https:')}).safeParse(d);
if(!z.uuid().safeParse(d.id).success||typeof d.approve!=='boolean'||typeof d.reason!=='string'||d.reason.trim().length<10||d.reason.length>500)return reply({error:'Programm und Prüfgrund erforderlich'},400);
if(!z.uuid().safeParse(d.place_id).success||d.action==='request_reward'&&!z.uuid().safeParse(d.card_id).success)return reply({error:'Ort oder Treuekarte ungültig'},400);
const code=typeof d.code==='string'?d.code.replace(/[\s-]/g,'').toUpperCase():'';if(!/^[A-F0-9]{24}$/.test(code))return reply({error:'Code prüfen'},400);
if(!request){await tx.query('ROLLBACK');return reply({error:'Code ungültig, abgelaufen oder bereits verwendet'},409)}
return reply({error:'Aktion ungültig'},400);
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Bitte anmelden'},401)
return reply({error:'Aktion fehlt'},400)
return reply({error:'Besuche, Abstand, Vorteil und HTTPS Bedingungen prüfen'},400)
return reply({error:'Kein freigegebenes eigenes Unternehmen'},403)
return reply({ok:true})
return reply({error:'Treuekarte konnte nicht gespeichert werden'},500)}finally{tx.release()
return reply({error:'Marketingberechtigung erforderlich'},403)
return reply({error:'Programm und Prüfgrund erforderlich'},400)
return reply({error:'Programm nicht gefunden'},404)
return reply({ok:true})
return reply({error:'Prüfung fehlgeschlagen'},500)}finally{tx.release()
return reply({error:'Ort oder Treuekarte ungültig'},400)
return reply({error:'Kein freigegebener Standort'},404)
return reply({error:'Keine eigenen Besuche für den Betrieb bestätigen lassen'},403)
return reply({error:'Bitte später erneut versuchen'},429)
return reply({error:'Vorteil noch nicht einlösbar'},409)
return reply({error:'Mindestabstand zum letzten bestätigten Besuch noch nicht erreicht'},409)
return reply({code,expires_at:r.rows[0].expires_at,notice:'Nur dem Betrieb vor Ort zeigen. Zehn Minuten gültig.'},201)
return reply({error:'Code konnte nicht erstellt werden'},500)}finally{tx.release()
return reply({error:'Code prüfen'},400)
return reply({error:'Code ungültig, abgelaufen oder bereits verwendet'},409)
return reply({error:'Kein Bestätigungsrecht an diesem Standort'},403)
return reply({error:'Vorteil bereits eingelöst oder noch nicht erreicht'},409)
return reply({error:'Mindestabstand zum letzten bestätigten Besuch noch nicht erreicht'},409)
return reply({ok:true,kind:request.kind,notice:request.kind==='reward'?'Vorteil einmalig eingelöst.':'Besuch vom Betrieb bestätigt.'})
return reply({error:'Bestätigung konnte nicht gespeichert werden'},500)}finally{tx.release()
return reply({error:'Aktion ungültig'},400)
```

### GET `/api/me`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Responses:

```ts
return ok({user})
```

### GET `/api/me/account-security`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
isRecentlyAuthenticated(req,u.id)
```

Responses:

```ts
return ok({social_providers:linked.rows.map(r=>r.provider),verified_email:Boolean(verified.rows[0]?.email_verified_at)
```

### POST `/api/me/delete`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "password": {
            "type": "string",
            "x-optional": true
          },
          "confirmation": {
            "const": "KONTO LÖSCHEN"
          }
        },
        "required": [
          "confirmation"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'account-delete');const u=need(user);
if(u.role==='admin')return bad('Administrators need an editorial handover before deleting their account',403);
if(activeBilling.rowCount)return bad('Bitte ein laufendes Abo zuerst kündigen und das Ende der Laufzeit abwarten. Offene Buchungen laufen nach 35 Minuten ab.',409);
if(owned.rowCount)return bad('Transfer or close your verified business with support before deleting your account',409);
isRecentlyAuthenticated(req,u.id)
if(!passwordValid&&!socialRecent)return bad('Password required, or please sign in again with Google/Apple within 5 minutes',403);
```

Validation expressions:

```ts
if(u.role==='admin')return bad('Administrators need an editorial handover before deleting their account',403);
if(activeBilling.rowCount)return bad('Bitte ein laufendes Abo zuerst kündigen und das Ende der Laufzeit abwarten. Offene Buchungen laufen nach 35 Minuten ab.',409);
if(owned.rowCount)return bad('Transfer or close your verified business with support before deleting your account',409);
const b=parse(z.object({password:z.string().optional().default(''),confirmation:z.literal('KONTO LÖSCHEN')}),await payload(req));
if(!passwordValid&&!socialRecent)return bad('Password required, or please sign in again with Google/Apple within 5 minutes',403);
```

Responses:

```ts
return bad('Administrators need an editorial handover before deleting their account',403)
return bad('Bitte ein laufendes Abo zuerst kündigen und das Ende der Laufzeit abwarten. Offene Buchungen laufen nach 35 Minuten ab.',409)
return bad('Transfer or close your verified business with support before deleting your account',409)
return bad('Password required, or please sign in again with Google/Apple within 5 minutes',403)
const response=ok({success:true})
```

### GET `/api/me/export`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
rate(req,'account-export');const u=need(user);
```

Responses:

```ts
const response=ok({exported_at:new Date().toISOString()
```

### GET `/api/me/preferences`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
return ok({preferences:r.rows[0]||{interests:[],districts:[],share_activity:false,notify_events:false,notify_news:false,notify_offers:false,notify_following:false,notify_tips:false}})
```

### POST `/api/me/preferences`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "interests": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 2,
              "maxLength": 60
            },
            "maxItems": 12
          },
          "districts": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 2,
              "maxLength": 60
            },
            "maxItems": 12
          },
          "share_activity": {
            "type": "boolean",
            "x-optional": true
          },
          "notify_events": {
            "type": "boolean",
            "x-optional": true
          },
          "notify_news": {
            "type": "boolean",
            "x-optional": true
          },
          "notify_offers": {
            "type": "boolean",
            "x-optional": true
          },
          "notify_following": {
            "type": "boolean",
            "x-optional": true
          },
          "notify_tips": {
            "type": "boolean",
            "x-optional": true
          }
        },
        "required": [
          "interests",
          "districts"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'user-preferences');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({
```

Responses:

```ts
return ok({preferences:r.rows[0],notice:'Einstellungen gespeichert. Push setzt eine ausdrückliche Gerätefreigabe voraus.'})
```

### DELETE `/api/me/push`

Handler: [app/api/me/push/route.ts](../app/api/me/push/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "all": {
            "type": "boolean"
          },
          "endpoint": {
            "type": "string",
            "format": "uri"
          }
        }
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Unerlaubte Herkunft'},403);
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
```

Validation expressions:

```ts
else if(typeof d?.endpoint==='string')await query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',[u.id,d.endpoint]);
```

Responses:

```ts
return reply({error:'Unerlaubte Herkunft'},403)
return reply({error:'Bitte anmelden'},401)
return reply({error:'Gerät fehlt'},400)
return reply({ok:true})
```

### GET `/api/me/push`

Handler: [app/api/me/push/route.ts](../app/api/me/push/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
```

Responses:

```ts
return reply({error:'Bitte anmelden'},401)
return reply({available:pushConfigured(),public_key:pushConfigured()?process.env.WEB_PUSH_PUBLIC_KEY:null,devices:r.rows[0].count})
```

### POST `/api/me/push`

Handler: [app/api/me/push/route.ts](../app/api/me/push/route.ts). Access: **session**.

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Unerlaubte Herkunft'},403);
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
if(existing.rows.length&&existing.rows[0].user_id!==u.id){await tx.query('ROLLBACK');return reply({error:'Dieses Gerät ist mit einem anderen Konto verbunden. Dort zuerst deaktivieren.'},409)}
if(count.rows[0].n>=10&&!existing.rows.length){await tx.query('ROLLBACK');return reply({error:'Maximal 10 Geräte. Zuerst ein Gerät entfernen.'},409)}
```

Validation expressions:

```ts
if(!reader)return reply({error:'Ungültige Anfrage'},400);
catch{return reply({error:'Ungültige Anfrage'},400)}
let d;try{d=JSON.parse(raw)}catch{return reply({error:'Ungültige Anfrage'},400)}
if(typeof d?.endpoint!=='string'||!safePushEndpoint(d.endpoint)||typeof d.keys?.p256dh!=='string'||typeof d.keys?.auth!=='string'||!validPushKeys(d.keys))return reply({error:'Ungültiges Push Abonnement'},400);
```

Responses:

```ts
return reply({error:'Unerlaubte Herkunft'},403)
return reply({error:'Bitte anmelden'},401)
return reply({error:'Push ist noch nicht eingerichtet'},503)
return reply({error:'Ungültige Anfrage'},400)
return reply({error:'Anfrage zu groß'},413)}raw+=decoder.decode(part.value,{stream:true})
return reply({error:'Ungültige Anfrage'},400)
return reply({error:'Ungültige Anfrage'},400)
return reply({error:'Ungültiges Push Abonnement'},400)
return reply({error:'Dieses Gerät ist mit einem anderen Konto verbunden. Dort zuerst deaktivieren.'},409)
return reply({error:'Maximal 10 Geräte. Zuerst ein Gerät entfernen.'},409)
return reply({ok:true})
return reply({error:'Gerät konnte nicht gespeichert werden'},500)}finally{await tx.query('ROLLBACK').catch(()=>{})
```

### POST `/api/me/verify-email/confirm`

Handler: [app/api/me/verify-email/confirm/route.ts](../app/api/me/verify-email/confirm/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          }
        },
        "required": [
          "token"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte zuerst mit dem richtigen Konto anmelden'},{status:401});
if(!t.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Code abgelaufen, fremd oder bereits verwendet'},{status:409})}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
const data=await req.json().catch(()=>null);if(typeof data?.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))return NextResponse.json({error:'Bestätigungscode ungültig'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Anfrage'},{status:403})
return NextResponse.json({error:'Bitte zuerst mit dem richtigen Konto anmelden'},{status:401})
return NextResponse.json({error:'Bestätigungscode ungültig'},{status:400})
return NextResponse.json({error:'Code abgelaufen, fremd oder bereits verwendet'},{status:409})
return NextResponse.json({verified:true})
return NextResponse.json({error:'Bestätigung fehlgeschlagen'},{status:500})
```

### GET `/api/me/verify-email/request`

Handler: [app/api/me/verify-email/request/route.ts](../app/api/me/verify-email/request/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
```

Responses:

```ts
return NextResponse.json({error:'Bitte anmelden'},{status:401})
return NextResponse.json({verified:Boolean(row.rows[0]?.email_verified_at),email:u.email,delivery_available:deliveryConfigured()},{headers:{'Cache-Control':'private,no-store'}})
```

### POST `/api/me/verify-email/request`

Handler: [app/api/me/verify-email/request/route.ts](../app/api/me/verify-email/request/route.ts). Access: **session**.

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Anfrage'},{status:403})
return NextResponse.json({error:'Bitte anmelden'},{status:401})
return NextResponse.json({error:'E-Mail Bestätigung momentan nicht eingerichtet'},{status:503})
return NextResponse.json({verified:true})
return NextResponse.json({error:'Bitte später erneut versuchen'},{status:429})
return NextResponse.json({error:e instanceof Error?e.message:'E-Mail Zustellung fehlgeschlagen'},{status:503})
return NextResponse.json({sent:true,notice:'Bestätigungslink verschickt, falls deine E-Mail erreichbar ist.'})
```

### GET `/api/media/[id]`

Handler: [app/api/media/[id]/route.ts](../app/api/media/[id]/route.ts). Access: **public or conditional**.

Authorization and state gates:

```ts
const u=await sessionUser(req);
if(u?.id!==m.owner_id&&!canAdmin(u,'moderation')){
```

Validation expressions:

```ts
const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return new NextResponse(null,{status:404});
```

Responses:

```ts
See the handler for non-JSON, redirect, media or shared-helper responses.
```

### DELETE `/api/media/manage`

Handler: [app/api/media/manage/route.ts](../app/api/media/manage/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
if(!uuid.test(data?.id||''))return NextResponse.json({error:'Ungültige Datei'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Anfrage'},{status:403})
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({error:'Ungültige Datei'},{status:400})
return NextResponse.json({error:'Datei nicht gefunden'},{status:404})
return NextResponse.json({deleted:true},{headers:{'Cache-Control':'no-store'}})
```

### GET `/api/media/moderation`

Handler: [app/api/media/moderation/route.ts](../app/api/media/moderation/route.ts). Access: **public or conditional**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u||!canAdmin(u,'moderation'))return NextResponse.json({error:'Forbidden'},{status:403});
```

Responses:

```ts
return NextResponse.json({error:'Forbidden'},{status:403})
return NextResponse.json({stories:stories.rows,highlights:highlights.rows})
```

### POST `/api/media/moderation`

Handler: [app/api/media/moderation/route.ts](../app/api/media/moderation/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "type": {
            "type": "string",
            "enum": [
              "story",
              "highlight"
            ]
          },
          "approve": {
            "type": "boolean"
          }
        },
        "required": [
          "id",
          "type",
          "approve"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});
const u=await sessionUser(req);if(!u||!canAdmin(u,'moderation'))return NextResponse.json({error:'Forbidden'},{status:403});
if(!r.rowCount)return NextResponse.json({error:'Item not active or media approval required'},{status:409});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});
if(!uuid.test(b?.id||'')||!['story','highlight'].includes(b?.type)||typeof b.approve!=='boolean')return NextResponse.json({error:'Invalid input'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Invalid origin'},{status:403})
return NextResponse.json({error:'Forbidden'},{status:403})
return NextResponse.json({error:'Invalid input'},{status:400})
return NextResponse.json({error:'Item not active or media approval required'},{status:409})
return NextResponse.json({status})
```

### GET `/api/media/review`

Handler: [app/api/media/review/route.ts](../app/api/media/review/route.ts). Access: **public or conditional**.

Authorization and state gates:

```ts
export async function GET(req:NextRequest){const u=await sessionUser(req);if(!u||!canAdmin(u,'moderation'))return denied();const r=await query("SELECT m.id,m.media_type,m.size_bytes,m.created_at,LEFT(u.display_name,1) AS uploader FROM user_media m JOIN users u ON u.id=m.owner_id WHERE m.status='pending' ORDER BY m.created_at LIMIT 50");return NextResponse.json({items:r.rows});}
```

Responses:

```ts
return NextResponse.json({items:r.rows})
```

### POST `/api/media/review`

Handler: [app/api/media/review/route.ts](../app/api/media/review/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "approve": {
            "type": "boolean"
          }
        },
        "required": [
          "id",
          "approve"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return denied();
const u=await sessionUser(req);if(!u||!canAdmin(u,'moderation'))return denied();
```

Validation expressions:

```ts
if(!data||!/^[0-9a-f-]{36}$/.test(data.id||'')||typeof data.approve!=='boolean')return NextResponse.json({error:'Invalid data'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Invalid data'},{status:400})
return NextResponse.json({error:'Not pending'},{status:404})
return NextResponse.json({status})
```

### GET `/api/media/rights`

Handler: [app/api/media/rights/route.ts](../app/api/media/rights/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
```

Responses:

```ts
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({media:media.rows,businesses:businesses.rows,grants:grants.rows})
```

### POST `/api/media/rights`

Handler: [app/api/media/rights/route.ts](../app/api/media/rights/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "grant",
              "revoke"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "business_id": {
            "type": "string",
            "format": "uuid"
          },
          "media_id": {
            "type": "string",
            "format": "uuid"
          },
          "expires_at": {
            "type": "string",
            "format": "date-time"
          }
        },
        "required": [
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
if(!r.rowCount)return NextResponse.json({error:'Rechte oder Geschäft nicht bestätigt'},{status:403});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
if(!uuid.test(b.id||''))return NextResponse.json({error:'ID fehlt'},{status:400});
if(b?.action!=='grant'||!uuid.test(b.business_id||'')||!uuid.test(b.media_id||''))return NextResponse.json({error:'Ungültige Auswahl'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Anfrage'},{status:403})
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({error:'ID fehlt'},{status:400})
return NextResponse.json({revoked:Boolean(r.rowCount)})
return NextResponse.json({error:'Ungültige Auswahl'},{status:400})
return NextResponse.json({error:'Freigabe muss zwischen 1 und 365 Tagen gültig sein'},{status:400})
return NextResponse.json({error:'Rechte oder Geschäft nicht bestätigt'},{status:403})
return NextResponse.json({id:r.rows[0].id,status:'granted'},{status:201})
```

### GET `/api/media/status`

Handler: [app/api/media/status/route.ts](../app/api/media/status/route.ts). Access: **public or conditional**.

Responses:

```ts
return NextResponse.json({upload_enabled:healthy,max_file_bytes:MAX,allowed_types:['image/jpeg','image/png','image/webp','video/mp4','video/webm']},{headers:{'Cache-Control':'no-store'}})
```

### POST `/api/media/upload`

Handler: [app/api/media/upload/route.ts](../app/api/media/upload/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "multipart/form-data": {
      "schema": {
        "type": "object",
        "properties": {
          "file": {
            "type": "string",
            "format": "binary",
            "description": "JPEG, PNG, WebP, MP4 or WebM; at most 24 MiB. Active private scanning and subsequent editorial approval required."
          },
          "license_confirmed": {
            "const": "true",
            "type": "string"
          }
        },
        "required": [
          "file",
          "license_confirmed"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
const user=await sessionUser(req);if(!user)return fail('Anmeldung erforderlich',401);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
if(!(file instanceof File)||!TYPES.includes(file.type))return fail('Nur JPG, PNG, WebP, MP4 oder WebM',415);
```

Responses:

```ts
return fail('Ungültige Herkunft',403)
return fail('Anmeldung erforderlich',401)
return fail('Datei zu groß',413)
return fail('Upload Limit erreicht',429)
return fail('Nur JPG, PNG, WebP, MP4 oder WebM',415)
return fail('Datei zu groß',413)
return fail('Bitte Medienrechte bestätigen',400)
return fail(err instanceof Error?err.message:'Upload fehlgeschlagen',process.env.CLAMD_HOST?400:503)
```

### GET `/api/news`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Responses:

```ts
return ok({items:r.rows})
```

### GET `/api/openapi`

Handler: [app/api/openapi/route.ts](../app/api/openapi/route.ts). Access: **public or conditional**.

Responses:

```ts
return NextResponse.json(specification,{headers:{'Cache-Control':'public,max-age=300'}})
```

### GET `/api/opening-hours`

Handler: [app/api/opening-hours/route.ts](../app/api/opening-hours/route.ts). Access: **public or conditional**.

Query names: `place_id`.

Validation expressions:

```ts
const id=req.nextUrl.searchParams.get('place_id');if(!z.uuid().safeParse(id).success)return reply({error:'Ort ungültig'},400);
```

Responses:

```ts
return reply({error:'Ort ungültig'},400)
return reply({error:'Ort nicht gefunden'},404)
return reply({state:known?(row.open_now?'open':'closed'):'unknown',plan:known?{day:row.day,periods:row.periods,source_url:row.source_url,checked_at:row.checked_at}:null,timezone:'Europe/Berlin',checked_at:new Date().toISOString()})
```

### POST `/api/opening-hours`

Handler: [app/api/opening-hours/route.ts](../app/api/opening-hours/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "format": "uuid"
          },
          "day": {
            "type": "string",
            "x-validation-expression": "z.string().regex(/^20\\d{2}-\\d{2}-\\d{2}$/)"
          },
          "state": {
            "type": "string",
            "enum": [
              "open",
              "closed",
              "withdraw"
            ]
          },
          "periods": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "start": {
                  "type": "integer"
                },
                "end": {
                  "type": "integer"
                }
              },
              "required": [
                "start",
                "end"
              ]
            },
            "maxItems": 6
          },
          "source_url": {
            "type": "string",
            "format": "uri",
            "maxLength": 1500,
            "x-validation-expression": "z.url().max(1500).refine(x=>new URL(x).protocol==='https:')"
          },
          "checked_at": {
            "x-validator": "z.iso"
          },
          "note": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          }
        },
        "required": [
          "place_id",
          "day",
          "state",
          "periods",
          "source_url",
          "checked_at",
          "note"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return reply({error:'Redaktionsberechtigung erforderlich'},403);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return reply({error:'Redaktionsberechtigung erforderlich'},403);
const parsed=z.object({place_id:z.uuid(),day:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),state:z.enum(['open','closed','withdraw']),periods:z.array(z.object({start:z.number().int(),end:z.number().int()})).max(6),source_url:z.url().max(1500).refine(x=>new URL(x).protocol==='https:'),checked_at:z.iso.datetime(),note:z.string().trim().min(10).max(500)}).safeParse(await req.json().catch(()=>null));
const d=parsed.data,day=Date.parse(d.day+'T12:00:00Z'),checked=Date.parse(d.checked_at);
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Redaktionsberechtigung erforderlich'},403)
return reply({error:'Datum, Zeitfenster und HTTPS Beleg erforderlich'},400)
return reply({error:'Gültigen Tagesplan ohne überlappende Zeiten mit aktueller Prüfung angeben'},400)
return reply({error:'Ort nicht gefunden'},404)
return reply({success:true})
return reply({error:'Tagesplan nicht gespeichert'},500)}finally{tx.release()
```

### GET `/api/pharmacy-notdienst`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Responses:

```ts
See the handler for non-JSON, redirect, media or shared-helper responses.
```

### GET `/api/place-attributes`

Handler: [app/api/place-attributes/route.ts](../app/api/place-attributes/route.ts). Access: **public or conditional**.

Query names: `place_id`, `scope`.

Authorization and state gates:

```ts
const u=await sessionUser(req);const admin=canAdmin(u,'editorial')&&req.nextUrl.searchParams.get('scope')==='admin';
```

Validation expressions:

```ts
const id=req.nextUrl.searchParams.get('place_id')||'';if(!z.uuid().safeParse(id).success)return reply({error:'Ungültiger Ort'},400);
```

Responses:

```ts
return reply({error:'Ungültiger Ort'},400)
return reply({items:r.rows})
```

### POST `/api/place-attributes`

Handler: [app/api/place-attributes/route.ts](../app/api/place-attributes/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "format": "uuid"
          },
          "value": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "yes",
                  "no",
                  "1",
                  "2",
                  "3",
                  "4"
                ]
              },
              {
                "type": "null"
              }
            ]
          },
          "source_url": {
            "type": "string",
            "format": "uri",
            "maxLength": 1500,
            "x-validation-expression": "z.url().max(1500).refine(v=>new URL(v).protocol==='https:')"
          },
          "checked_at": {
            "x-validator": "z.iso"
          },
          "note": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          }
        },
        "required": [
          "place_id",
          "value",
          "source_url",
          "checked_at",
          "note"
        ],
        "x-validation-expression": "z.object({place_id:z.uuid(),field,value:z.enum(['yes','no','1','2','3','4']).nullable(),source_url:z.url().max(1500).refine(v=>new URL(v).protocol==='https:'),checked_at:z.iso.datetime(),note:z.string().trim().min(10).max(500)}).refine(v=>v.value===null||(v.field==='price_level'?['1','2','3','4'].includes(v.value):['yes','no'].includes(v.value)))"
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return reply({error:'Admin erforderlich'},403);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const parsed=input.safeParse(await req.json().catch(()=>null));if(!parsed.success)return reply({error:'Beleg, HTTPS Quelle und gültige Angabe erforderlich'},400);
const d=parsed.data,stamp=Date.parse(d.checked_at);if(stamp>Date.now()||stamp<Date.now()-30*86400000)return reply({error:'Prüfdatum muss in den letzten 30 Tagen liegen'},400);
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Admin erforderlich'},403)
return reply({error:'Beleg, HTTPS Quelle und gültige Angabe erforderlich'},400)
return reply({error:'Prüfdatum muss in den letzten 30 Tagen liegen'},400)
return reply({error:'Ort nicht gefunden'},404)
return reply({ok:true})
return reply({error:'Merkmal konnte nicht gespeichert werden'},500)}finally{tx.release()
```

### POST `/api/place-reports`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "maxLength": 90,
            "x-validation-expression": "z.string().max(90).refine(validLocationId)"
          },
          "reason": {
            "type": "string",
            "enum": [
              "closed",
              "address",
              "details",
              "other"
            ]
          },
          "message": {
            "type": "string",
            "minLength": 12,
            "maxLength": 750
          }
        },
        "required": [
          "place_id",
          "reason",
          "message"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'place-report');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),
const isOsm=osmId.test(b.place_id);
if(!exists.rowCount)return bad('Place not found',404);
```

Responses:

```ts
return bad('Place not found',404)
return ok({id:r.rows[0].id,status:r.rows[0].status},201)
```

### GET `/api/places`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `category`, `district`, `q`, `mode`.

Validation expressions:

```ts
if(mode&&mode!=='verified'&&mode!=='top')return bad('Unbekannter Ansichtsmodus');
```

Responses:

```ts
return bad('Unbekannter Ansichtsmodus')
return ok({items:r.rows})
```

### GET `/api/plans`

Handler: [app/api/plans/route.ts](../app/api/plans/route.ts). Access: **public or conditional**.

Query names: `all`.

Authorization and state gates:

```ts
const u=await sessionUser(req);
const showDrafts=req.nextUrl.searchParams.get('all')==='1'&&canAdmin(u,'finance');
```

Responses:

```ts
return NextResponse.json({items:r.rows,checkout_available:billingConfigured(),subscription_activation_available:billingConfigured(),reason:billingConfigured()?null:'Zahlungsdienst noch nicht eingerichtet'},{headers:{'Cache-Control':'no-store'}})
```

### POST `/api/post-likes`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "post_id": {
            "type": "string",
            "format": "uuid"
          },
          "active": {
            "type": "boolean"
          }
        },
        "required": [
          "post_id",
          "active"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'post-like');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({post_id:id,active:z.boolean()}),await payload(req));
if(!visible.rowCount)return bad('Post not found',404);
```

Responses:

```ts
return bad('Post not found',404)
return ok({success:true,liked:b.active,count:count.rows[0].count})
```

### GET `/api/posts`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `scope`.

Authorization and state gates:

```ts
if(following&&!user)return bad('Login required',401);
```

Validation expressions:

```ts
if(qs.has('scope')&&!['all','following'].includes(qs.get('scope')||''))return bad('Invalid feed scope');
if(following&&!user)return bad('Login required',401);
```

Responses:

```ts
return bad('Invalid feed scope')
return bad('Login required',401)
return ok({items:r.rows,scope:following?'following':'all'})
```

### POST `/api/posts`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "body": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1000
          },
          "place_id": {
            "anyOf": [
              {
                "type": "string",
                "x-validation-expression": "z.string().refine(validLocationId)"
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "media_id": {
            "anyOf": [
              {
                "type": "string",
                "format": "uuid"
              },
              {
                "type": "null"
              }
            ],
            "x-optional": true
          },
          "media_url": {
            "type": "string",
            "maxLength": 1000,
            "x-optional": true
          }
        },
        "required": [
          "body"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'post');const u=need(user);
if(b.media_id){const media=await query("SELECT id FROM user_media WHERE id=$1 AND owner_id=$2 AND status IN ('pending','approved') AND license_confirmed=true",[b.media_id,u.id]);if(!media.rowCount)return bad('Medium nicht autorisiert',403);}
```

Validation expressions:

```ts
const b=parse(z.object({body:text(1000),place_id:z.string().refine(validLocationId).nullish(),media_id:id.nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
if(b.media_url)return bad('Externe Medienlinks sind nicht zulässig. Bitte eigene Datei hochladen.');
const candidate=osmId.test(b.place_id);
if(!r.rowCount)return bad('Place not found',404);
```

Responses:

```ts
return bad('Externe Medienlinks sind nicht zulässig. Bitte eigene Datei hochladen.')
return bad('Medium nicht autorisiert',403)
return bad('Place not found',404)
return ok({id:r.rows[0].id,status:'pending'},201)
```

### GET `/api/recommendations`

Handler: [app/api/recommendations/route.ts](../app/api/recommendations/route.ts). Access: **public or conditional**.

Authorization and state gates:

```ts
const q=req.nextUrl.searchParams;if(q.get('ai')==='1'&&!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});let ctx;try{ctx=parseDiscoveryContext(q)}catch{return NextResponse.json({error:'Datum, Anlass oder Budget ungültig'},{status:400})}
const search=(q.get('q')||'').trim().slice(0,180),lang=q.get('lang')==='en'?'en':'de',u=await sessionUser(req);
```

Validation expressions:

```ts
const q=req.nextUrl.searchParams;if(q.get('ai')==='1'&&!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});let ctx;try{ctx=parseDiscoveryContext(q)}catch{return NextResponse.json({error:'Datum, Anlass oder Budget ungültig'},{status:400})}
const scored=places.rows.filter(p=>contextMatches(p.facts,ctx,Boolean(weather?.prefer_indoor),p)).map(p=>({p,score:words.reduce((v,w)=>v+([p.name,p.category,p.district,p.description_de,p.description_en].join(' ').toLocaleLowerCase().includes(w)?1:0),0)+(pref?.districts?.includes(p.district)?2:0)})).sort((a,b)=>b.score-a.score);
try{const r=await textJSON('Return JSON {"ids":[]} containing up to four supplied venue IDs ordered by relevance. Never invent venues, prices, availability or opening hours.',{question:search,context:{...ctx,lat:undefined,lon:undefined},interests:pref?.interests||[],candidates:scored.slice(0,12).map(x=>x.p)});if(Array.isArray(r.ids)){const ids=r.ids.filter((x):x is string=>typeof x==='string');const ranked=ids.map(id=>items.find(p=>p.id===id)).filter((x):x is typeof items[number]=>Boolean(x));if(ranked.length){items=[...new Map(ranked.map(p=>[p.id,p])).values()];mode='ai'}}}catch{/* Deterministic verified fallback. */}
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Datum, Anlass oder Budget ungültig'},{status:400})
```

### GET `/api/review-replies`

Handler: [app/api/review-replies/route.ts](../app/api/review-replies/route.ts). Access: **session**.

Query names: `scope`.

Authorization and state gates:

```ts
const actor=await sessionUser(req);if(!actor)return reply({error:'Anmeldung erforderlich'},401);
if(!canAdmin(actor,'moderation'))return reply({error:'Keine Berechtigung'},403);
```

Responses:

```ts
return reply({error:'Anmeldung erforderlich'},401)
return reply({error:'Keine Berechtigung'},403)
return reply({items:r.rows})
return reply({items:r.rows})
```

### POST `/api/review-replies`

Handler: [app/api/review-replies/route.ts](../app/api/review-replies/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "save",
              "remove",
              "moderate"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "body": {
            "type": "string",
            "minLength": 20,
            "maxLength": 1000,
            "x-optional": true
          },
          "approve": {
            "type": "boolean",
            "x-optional": true
          }
        },
        "required": [
          "action",
          "id"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const actor=await sessionUser(req);if(!actor)return reply({error:'Anmeldung erforderlich'},401);
if(!canAdmin(actor,'moderation')){await tx.query('ROLLBACK');return reply({error:'Keine Berechtigung'},403)}
if(!r.rowCount){await tx.query('ROLLBACK');return reply({error:'Antwort nicht mehr freigabefähig'},409)}
if(!review||editor?.id!==review.business_id){await tx.query('ROLLBACK');return reply({error:'Keine Berechtigung für diese Bewertung'},403)}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const parsed=z.object({action:z.enum(['save','remove','moderate']),id:z.uuid(),body:z.string().trim().min(20).max(1000).optional(),approve:z.boolean().optional()}).safeParse(await req.json().catch(()=>null));
if(typeof d.approve!=='boolean'){await tx.query('ROLLBACK');return reply({error:'Entscheidung fehlt'},400)}
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Anmeldung erforderlich'},401)
return reply({error:'Antwort prüfen'},400)
return reply({error:'Keine Berechtigung'},403)
return reply({error:'Entscheidung fehlt'},400)
return reply({error:'Antwort nicht mehr freigabefähig'},409)
return reply({error:'Keine Berechtigung für diese Bewertung'},403)
return reply({error:'Antwort fehlt'},400)
return reply({success:true})
return reply({error:'Antwort konnte nicht gespeichert werden'},500)}finally{tx.release()
```

### POST `/api/review-reports`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "review_id": {
            "type": "string",
            "format": "uuid"
          },
          "reason": {
            "type": "string",
            "enum": [
              "spam",
              "abuse",
              "privacy",
              "incorrect",
              "other"
            ]
          },
          "message": {
            "type": "string",
            "maxLength": 500,
            "x-optional": true
          }
        },
        "required": [
          "review_id",
          "reason"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'review-abuse');const u=need(user);
if(!r.rowCount)return bad('Already reported',409);
```

Validation expressions:

```ts
const b=parse(z.object({review_id:id,reason:z.enum(['spam','abuse','privacy','incorrect','other']),message:optionalText(500)}),await payload(req));
if(!found.rowCount)return bad('Review unavailable',404);
if(!r.rowCount)return bad('Already reported',409);
```

Responses:

```ts
return bad('Review unavailable',404)
return bad('Already reported',409)
return ok({id:r.rows[0].id,status:'pending'},201)
```

### GET `/api/reviews`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `place_id`, `sort`.

Validation expressions:

```ts
if(!validLocationId(venueId))return bad('Invalid place ID');
const isCandidate=osmId.test(venueId);
if(!exists.rowCount)return bad('Place not found',404);
const order=orders[qs.get('sort')||'newest'];if(!order)return bad('Invalid review sort');
```

Responses:

```ts
return bad('Invalid place ID')
return bad('Place not found',404)
return bad('Invalid review sort')
const response=ok({summary:summary.rows[0],items:items.rows,own:own.rows[0]||null})
```

### POST `/api/reviews`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "maxLength": 90,
            "x-validation-expression": "z.string().max(90).refine(validLocationId)"
          },
          "rating": {
            "type": "integer",
            "minimum": 1,
            "maximum": 5
          },
          "body": {
            "type": "string",
            "minLength": 20,
            "maxLength": 1000
          }
        },
        "required": [
          "place_id",
          "rating",
          "body"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'venue-review');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),rating:z.number().int().min(1).max(5),body:z.string().trim().min(20).max(1000)}),await payload(req));
const isCandidate=osmId.test(b.place_id);
if(!exists.rowCount)return bad('Place not found',404);
```

Responses:

```ts
return bad('Place not found',404)
return ok({id:r.rows[0].id,status:'pending'},201)
```

### POST `/api/reviews/remove`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {}
      }
    }
  }
}
```

Authorization and state gates:

```ts
const u=need(user);const b=parse(z.object({id}),await payload(req));
```

Validation expressions:

```ts
const u=need(user);const b=parse(z.object({id}),await payload(req));
if(!r.rowCount)return bad('Review not found',404);
```

Responses:

```ts
return bad('Review not found',404)
return ok({success:true})
```

### GET `/api/stories`

Handler: [app/api/stories/route.ts](../app/api/stories/route.ts). Access: **session**.

Query names: `business_id`.

Authorization and state gates:

```ts
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
if(!owner.rowCount)return NextResponse.json({error:'Keine Berechtigung'},{status:403});
```

Validation expressions:

```ts
if(!uuid.test(business))return NextResponse.json({error:'Ungültiges Unternehmen'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültiges Unternehmen'},{status:400})
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({error:'Keine Berechtigung'},{status:403})
return NextResponse.json({items:own.rows},{headers:{'Cache-Control':'private,no-store'}})
return NextResponse.json({items:r.rows})
```

### POST `/api/stories`

Handler: [app/api/stories/route.ts](../app/api/stories/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "create",
              "remove"
            ]
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "media_id": {
            "type": "string",
            "format": "uuid"
          },
          "caption": {
            "type": "string",
            "maxLength": 280
          },
          "business_id": {
            "type": "string",
            "format": "uuid"
          },
          "place_id": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "action"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
if(!editor||editor.id!==b.business_id||editor.status!=='approved')return NextResponse.json({error:'Standort nicht berechtigt'},{status:403});
if(!r.rowCount)return NextResponse.json({error:'Medium nicht verfügbar'},{status:403});
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
if(!b||!['create','remove'].includes(b.action))return NextResponse.json({error:'Ungültige Aktion'},{status:400});
if(!uuid.test(b.id||''))return NextResponse.json({error:'ID fehlt'},{status:400});
if(!uuid.test(b.media_id||'')||typeof b.caption!=='string'||b.caption.length>280)return NextResponse.json({error:'Ungültiges Medium'},{status:400});
if(!uuid.test(b.business_id||'')||!uuid.test(b.place_id||''))return NextResponse.json({error:'Unternehmen und Standort erforderlich'},{status:400});
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Anfrage'},{status:403})
return NextResponse.json({error:'Anmeldung erforderlich'},{status:401})
return NextResponse.json({error:'Ungültige Aktion'},{status:400})
return NextResponse.json({error:'ID fehlt'},{status:400})
return NextResponse.json({removed:Boolean(r.rowCount)})
return NextResponse.json({error:'Ungültiges Medium'},{status:400})
return NextResponse.json({error:'Unternehmen und Standort erforderlich'},{status:400})
return NextResponse.json({error:'Standort nicht berechtigt'},{status:403})
return NextResponse.json({error:'Tageslimit erreicht'},{status:429})
return NextResponse.json({error:'Medium nicht verfügbar'},{status:403})
return NextResponse.json({story:r.rows[0],notice:'Story wartet auf redaktionelle Freigabe.'},{status:201})
```

### GET `/api/tips`

Handler: [app/api/tips/route.ts](../app/api/tips/route.ts). Access: **public or conditional**.

Query names: `scope`.

Authorization and state gates:

```ts
const user=await sessionUser(req),admin=req.nextUrl.searchParams.get('scope')==='admin'&&canAdmin(user,'editorial');
```

Responses:

```ts
return NextResponse.json({items:items.rows,places},{headers:{'Cache-Control':'no-store'}})
```

### POST `/api/tips`

Handler: [app/api/tips/route.ts](../app/api/tips/route.ts). Access: **public or conditional**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "place_id": {
            "type": "string",
            "format": "uuid"
          },
          "title": {
            "type": "string",
            "minLength": 4,
            "maxLength": 150
          },
          "body": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500
          },
          "publish_at": {
            "x-validator": "z.iso"
          },
          "expires_at": {
            "x-validator": "z.iso"
          }
        },
        "required": [
          "place_id",
          "title",
          "body",
          "publish_at",
          "expires_at"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
const u=await sessionUser(req);if(!canAdmin(u,'editorial')||!u)return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403});
if(!place.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Nur aktuell unabhängig geprüfte Orte verwenden'}, {status:409})}
```

Validation expressions:

```ts
if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
if(d?.action==='archive'&&z.uuid().safeParse(d.id).success){
const p=z.object({place_id:z.uuid(),title:z.string().trim().min(4).max(150),body:z.string().trim().min(10).max(500),publish_at:z.iso.datetime(),expires_at:z.iso.datetime()}).safeParse(d);
const v=p.data,start=Date.parse(v.publish_at),end=Date.parse(v.expires_at);
```

Responses:

```ts
return NextResponse.json({error:'Ungültige Herkunft'},{status:403})
return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403})
return NextResponse.json({ok:true})}catch{await tx.query('ROLLBACK')
return NextResponse.json({error:'Änderung fehlgeschlagen'},{status:500})}finally{tx.release()
return NextResponse.json({error:'Ort, Text und Zeitraum prüfen'},{status:400})
return NextResponse.json({error:'Bis 30 Tage voraus, höchstens sieben Tage Laufzeit'}, {status:400})
return NextResponse.json({error:'Nur aktuell unabhängig geprüfte Orte verwenden'}, {status:409})
return NextResponse.json({id:r.rows[0].id},{status:201})
return NextResponse.json({error:'Tipp konnte nicht gespeichert werden'}, {status:500})}finally{tx.release()
```

### GET `/api/tours`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Authorization and state gates:

```ts
const u=need(user);
```

Responses:

```ts
return ok({items:r.rows})
```

### POST `/api/tours`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "action": {
                "const": "save"
              },
              "id": {
                "type": "string",
                "format": "uuid",
                "x-optional": true
              },
              "title": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100
              },
              "stop_ids": {
                "type": "array",
                "items": {
                  "type": "string",
                  "x-validation-expression": "z.string().refine(validLocationId)"
                },
                "minItems": 2,
                "maxItems": 8
              },
              "planned_times": {
                "type": "array",
                "items": {
                  "anyOf": [
                    {
                      "type": "string",
                      "x-validation-expression": "z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/)"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "maxItems": 8,
                "x-optional": true
              }
            },
            "required": [
              "action",
              "title",
              "stop_ids"
            ]
          },
          {
            "type": "object",
            "properties": {
              "action": {
                "const": "share"
              },
              "enabled": {
                "type": "boolean"
              }
            },
            "required": [
              "action",
              "enabled"
            ]
          },
          {
            "type": "object",
            "properties": {
              "action": {
                "const": "delete"
              }
            },
            "required": [
              "action"
            ]
          }
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
rate(req,'tour');const u=need(user);
```

Validation expressions:

```ts
const b=parse(z.discriminatedUnion('action',[
if(!removed.rowCount)return bad('Tour not found',404);
if(!changed.rowCount)return bad('Tour not found',404);
if(new Set(b.stop_ids).size!==b.stop_ids.length)return bad('Each stop can appear only once');
if(b.planned_times&&b.planned_times.length!==b.stop_ids.length)return bad('Times do not match stops');
const candidate=osmId.test(stop);
if(!available.rowCount)return bad('Tour stop is not an accessible real venue',404);
if(!owned.rowCount){await tx.query('ROLLBACK');return bad('Tour not found',404)}
const stop=b.stop_ids[i],candidate=osmId.test(stop);
```

Responses:

```ts
return bad('Tour not found',404)
return ok({success:true})
return bad('Tour not found',404)
return ok({success:true,token:changed.rows[0].share_token||null})
return bad('Each stop can appear only once')
return bad('Times do not match stops')
return bad('Tour stop is not an accessible real venue',404)
return bad('Tour not found',404)
return ok({id:tourId,success:true},b.id?200:201)
```

### GET `/api/tours/curated`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Validation expressions:

```ts
const stops=r.rows.filter(p=>t.categories.includes(p.category)&&p.activity_status!=='permanently_closed').slice(0,5);
```

Responses:

```ts
return ok({items,notice:'Standorte, Zugang und Gehzeiten vor der Tour unabhängig beim Anbieter prüfen. Nicht bestätigte Stopps sind gekennzeichnet.'})
```

### GET `/api/tours/details`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **session**.

Query names: `id`.

Authorization and state gates:

```ts
const u=need(user);
```

Validation expressions:

```ts
const tourId=qs.get('id')||'';if(!id.safeParse(tourId).success)return bad('Invalid tour ID');
if(!r.rowCount)return bad('Tour not found',404);
```

Responses:

```ts
return bad('Invalid tour ID')
return bad('Tour not found',404)
return ok({tour:r.rows[0],stops:stops.rows})
```

### GET `/api/tours/shared`

Handler: [app/api/[[...path]]/route.ts](../app/api/[[...path]]/route.ts). Access: **public or conditional**.

Query names: `token`.

Validation expressions:

```ts
if(!/^[A-Za-z0-9_-]{43}$/.test(token))return bad('Invalid tour link',404);
if(!r.rowCount)return bad('Tour link not found',404);
```

Responses:

```ts
return bad('Invalid tour link',404)
return bad('Tour link not found',404)
return ok({tour:{title:r.rows[0].title},stops:stops.rows,shared:true})
```

### POST `/api/translations`

Handler: [app/api/translations/route.ts](../app/api/translations/route.ts). Access: **session**.

Request body contract:

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "post_id": {
            "type": "string",
            "format": "uuid"
          },
          "language": {
            "type": "string",
            "enum": [
              "de",
              "en"
            ]
          },
          "consent": {
            "x-validator": "z"
          }
        },
        "required": [
          "post_id",
          "language",
          "consent"
        ]
      }
    }
  }
}
```

Authorization and state gates:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
const current=(await query("SELECT body FROM posts WHERE id=$1 AND status='published'",[d.post_id])).rows[0];if(current?.body!==post.body)return reply({error:'Beitrag wurde geändert. Bitte neu laden.'},409);
```

Validation expressions:

```ts
if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
const parsed=z.object({post_id:z.uuid(),language:z.enum(['de','en']),consent:z.literal(true)}).safeParse(await req.json().catch(()=>null));if(!parsed.success)return reply({error:'Beitrag, Sprache und Zustimmung erforderlich'},400);
if(typeof post.body!=='string'||!post.body.trim()||post.body.length>4000)return reply({error:'Beitrag kann nicht übersetzt werden'},400);
const translated=result.text;if(typeof translated!=='string'||!translated.trim()||translated.length>12000||/[<>]/.test(translated))throw Error('Invalid translation');
```

Responses:

```ts
return reply({error:'Ungültige Herkunft'},403)
return reply({error:'Bitte anmelden'},401)
return reply({error:'Beitrag, Sprache und Zustimmung erforderlich'},400)
return reply({error:'Beitrag nicht verfügbar'},404)
return reply({error:'Beitrag kann nicht übersetzt werden'},400)
return reply({text:cached.body,machine_translated:true})
return reply({error:'Übersetzungsdienst noch nicht eingerichtet'},503)
return reply({error:'Übersetzungslimit erreicht. Bitte später erneut versuchen.'},429)
return reply({error:'Beitrag wurde geändert. Bitte neu laden.'},409)
return reply({text:translated.trim(),machine_translated:true})
return reply({error:'Übersetzung derzeit nicht möglich. Der Originaltext bleibt verfügbar.'},503)
```

### GET `/api/trends`

Handler: [app/api/trends/route.ts](../app/api/trends/route.ts). Access: **public or conditional**.

Query names: `district`, `category`.

Responses:

```ts
return NextResponse.json({error:'Filter zu lang'},{status:400})
return NextResponse.json({items:r.rows,window_days:7,minimum_accounts:3,source:'Öffentliche Likes in FFM mit freigegebener Aktivität. Keine Besucherzahlen oder Aussage über die gesamte Stadt.'})
```
