-- Historical October child verdicts were sent as private Zendesk notes before
-- a QWP monitoria was required. This one-time import preserves the original
-- three-check score and verdict; it does not claim the current six-check form
-- was answered and it never republishes a Zendesk comment.
BEGIN;

CREATE TABLE public.legacy_child_note_receipts (
  ticket_id text PRIMARY KEY,
  zendesk_comment_id bigint NOT NULL UNIQUE,
  zendesk_comment_at timestamptz NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('valido', 'invalido')),
  original_job_id uuid NOT NULL,
  monitoria_id uuid UNIQUE REFERENCES public.monitorias(id),
  imported_at timestamptz
);
ALTER TABLE public.legacy_child_note_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_child_note_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legacy_child_note_receipts TO authenticated;
GRANT ALL ON public.legacy_child_note_receipts TO service_role;
CREATE POLICY legacy_child_note_quality_read ON public.legacy_child_note_receipts
  FOR SELECT TO authenticated USING (_private.is_quality_team_user());

INSERT INTO public.legacy_child_note_receipts
  (ticket_id,zendesk_comment_id,zendesk_comment_at,verdict,original_job_id)
SELECT audited.ticket_id,audited.zendesk_comment_id,audited.zendesk_comment_at,
  audited.verdict,audited.original_job_id
FROM (VALUES
    ('176473',54124764984212,'2026-10-01T11:56:22Z'::timestamptz,'valido','d74a95d8-4529-4abd-b879-d4de9fb69536'::uuid),
    ('176598',54128054126868,'2026-10-01T13:33:52Z'::timestamptz,'invalido','d6b07ef8-f575-4f2a-b4a8-6eeb67782e4f'::uuid),
    ('176647',54129812173844,'2026-10-01T14:16:11Z'::timestamptz,'invalido','1b379077-90c2-45ec-bfbc-fabf96a38561'::uuid),
    ('176662',54129762305940,'2026-10-01T14:15:01Z'::timestamptz,'valido','cb3b1352-ebb8-4d39-af1e-a5fd4b38d832'::uuid),
    ('176674',54129697261716,'2026-10-01T14:13:59Z'::timestamptz,'invalido','e40f4457-09a2-4917-a8fe-41f3de3c19c8'::uuid),
    ('176735',54135377513492,'2026-10-01T16:23:09Z'::timestamptz,'valido','fbd698ab-1738-49cf-b904-974daae11ffd'::uuid),
    ('176773',54135046166164,'2026-10-01T16:14:31Z'::timestamptz,'valido','f3225d62-7dff-46a8-b058-627ac2378160'::uuid),
    ('176785',54135128589844,'2026-10-01T16:15:53Z'::timestamptz,'valido','f8b31171-3ac9-4dde-b7cf-04278f7acf81'::uuid),
    ('176793',54135170408724,'2026-10-01T16:17:06Z'::timestamptz,'valido','0a25a4e8-c299-4d4b-8673-afaaf7cb495f'::uuid),
    ('176813',54136687781396,'2026-10-01T16:53:25Z'::timestamptz,'invalido','7ecd5621-384e-41de-a9f1-d3699f653cbc'::uuid),
    ('176815',54135200752148,'2026-10-01T16:19:00Z'::timestamptz,'valido','103c3c9f-1834-4113-aa4f-a695839aed21'::uuid),
    ('176820',54135272692500,'2026-10-01T16:19:51Z'::timestamptz,'valido','79880974-90e1-4619-bca6-fc87489b0494'::uuid),
    ('176826',54140083955732,'2026-10-01T18:11:22Z'::timestamptz,'valido','6c3e040e-fe49-4b90-bd22-a8321bf0d0e1'::uuid),
    ('176829',54140003770388,'2026-10-01T18:09:14Z'::timestamptz,'valido','a65e85c5-165d-45bf-a0be-378235d233d6'::uuid),
    ('176831',54135295379220,'2026-10-01T16:20:43Z'::timestamptz,'valido','c06caf04-4e9d-491d-b6a7-66d1e3248648'::uuid),
    ('176843',54135370208532,'2026-10-01T16:22:00Z'::timestamptz,'valido','3abb264a-8279-483f-b4b6-a77e1fe40af0'::uuid),
    ('176847',54135517665684,'2026-10-01T16:26:08Z'::timestamptz,'valido','fe90f9a5-a5b9-4fc9-95f0-b5e62e539783'::uuid),
    ('176854',54135585056276,'2026-10-01T16:27:44Z'::timestamptz,'invalido','9a808caf-f4d4-4969-b49e-d0023931da08'::uuid),
    ('176918',54139932320660,'2026-10-01T18:08:02Z'::timestamptz,'valido','54392c4d-8f9e-43d0-a1a4-8e25874049f8'::uuid),
    ('176947',54140069714580,'2026-10-01T18:10:16Z'::timestamptz,'valido','bc638da4-d91a-40b2-b804-3e4f5fc8918b'::uuid),
    ('177008',54140763916308,'2026-10-01T18:26:14Z'::timestamptz,'invalido','9f9f46bb-5d7c-4f80-b067-557c04b1a17d'::uuid),
    ('177029',54141911707028,'2026-10-01T18:55:07Z'::timestamptz,'valido','ba56d0ee-6a28-4622-9a0b-e663e106f0e5'::uuid),
    ('177030',54142010220180,'2026-10-01T18:57:13Z'::timestamptz,'valido','6e619500-3285-42b7-8974-b18645bd2178'::uuid),
    ('177108',54162229577108,'2026-10-02T11:01:20Z'::timestamptz,'invalido','439e473b-23fc-4f1b-be6b-d0ef3028c8a8'::uuid),
    ('177150',54289555662100,'2026-10-06T12:52:09Z'::timestamptz,'valido','75244770-c7eb-4207-90aa-664e3904e06c'::uuid),
    ('177160',54162327942676,'2026-10-02T11:04:51Z'::timestamptz,'valido','ca6cb712-b774-41a8-929d-cf6ae95b90ee'::uuid),
    ('177166',54162193920532,'2026-10-02T10:58:52Z'::timestamptz,'valido','cebf4768-a53b-4875-9d78-63809bef8583'::uuid),
    ('177172',54162255224084,'2026-10-02T11:03:13Z'::timestamptz,'valido','7d133f8d-64cc-4351-937b-3045aef649f2'::uuid),
    ('177255',54162488563988,'2026-10-02T11:12:58Z'::timestamptz,'invalido','d3f9064d-79db-475a-b691-703047c93d4c'::uuid),
    ('177287',54163594045204,'2026-10-02T12:04:38Z'::timestamptz,'invalido','62e5f614-907a-4bb4-8667-7957a7b0b5c3'::uuid),
    ('177300',54163636175508,'2026-10-02T12:05:54Z'::timestamptz,'valido','5ad2fe90-b59d-4a59-9fbb-d77e15c28ebd'::uuid),
    ('177317',54163810091412,'2026-10-02T12:11:37Z'::timestamptz,'valido','02700032-3eb4-4fdf-bd66-25880f714714'::uuid),
    ('177323',54163852204564,'2026-10-02T12:12:46Z'::timestamptz,'valido','5cc64531-e0ab-41ec-9fab-8f2d37caf4c2'::uuid),
    ('177342',54163831181076,'2026-10-02T12:13:46Z'::timestamptz,'valido','f4638ecb-f4c6-4225-939b-0740eb7d0e0a'::uuid),
    ('177388',54165607789332,'2026-10-02T13:07:53Z'::timestamptz,'valido','bc4be020-7745-4484-bd5d-86d96fcfd6d1'::uuid),
    ('177406',54165722807828,'2026-10-02T13:10:33Z'::timestamptz,'invalido','7a8743fa-4951-40e4-9d90-731a270f30ad'::uuid),
    ('177407',54167183403028,'2026-10-02T13:51:20Z'::timestamptz,'valido','ca2ecfb6-db1e-4200-a95a-38b842bed8ae'::uuid),
    ('177418',54165654687124,'2026-10-02T13:09:08Z'::timestamptz,'valido','6898bdb3-1e02-4964-bae7-6e5ba11615a9'::uuid),
    ('177431',54175613074836,'2026-10-02T17:08:25Z'::timestamptz,'invalido','5221e4e7-36a9-4d03-9421-d5be1ec7e1ff'::uuid),
    ('177436',54168767821716,'2026-10-02T14:29:11Z'::timestamptz,'valido','f159fd5b-1c15-4fec-8949-ef06655d62a0'::uuid),
    ('177446',54165737003540,'2026-10-02T13:11:21Z'::timestamptz,'valido','bb025ade-42bf-429d-b310-75ccd61fe998'::uuid),
    ('177498',54167220711060,'2026-10-02T13:52:51Z'::timestamptz,'valido','2b3ce195-406d-4b54-984e-e930e2cdd362'::uuid),
    ('177538',54168142198292,'2026-10-02T14:14:02Z'::timestamptz,'valido','a45e4a52-b1bd-4572-af95-cd2019b7a4f7'::uuid),
    ('177542',54168319449108,'2026-10-02T14:18:17Z'::timestamptz,'invalido','396a0adf-c573-4878-a9d7-16cf1c027e4a'::uuid),
    ('177570',54180615585428,'2026-10-02T19:08:22Z'::timestamptz,'valido','9359295c-f667-4659-80d8-9f892ba71a1b'::uuid),
    ('177607',54174659180052,'2026-10-02T16:46:58Z'::timestamptz,'valido','d8d7c5b0-bfdb-4c7c-836e-892ce9ffd1a3'::uuid),
    ('177621',54180445153300,'2026-10-02T19:04:04Z'::timestamptz,'invalido','417d306a-0242-4984-9ff7-ec34b3b51238'::uuid),
    ('177627',54180540030612,'2026-10-02T19:06:06Z'::timestamptz,'invalido','f37a5192-224c-4ca4-9767-b49cac114d66'::uuid),
    ('177636',54174393535252,'2026-10-02T16:40:20Z'::timestamptz,'invalido','94a74f01-04fe-45f7-a654-a4bcbc6a34b9'::uuid),
    ('177680',54183298675476,'2026-10-02T20:10:38Z'::timestamptz,'invalido','2f6a04f6-ec6c-4b35-912d-65a44ae2f8e2'::uuid),
    ('177701',54174733063316,'2026-10-02T16:48:25Z'::timestamptz,'invalido','d02ccbb4-8b96-42a8-8f3e-82d652a58f17'::uuid),
    ('177702',54175562801556,'2026-10-02T17:07:04Z'::timestamptz,'invalido','5746b15b-b990-4a6f-a2f0-231e1fb6c3a2'::uuid),
    ('177726',54180602745492,'2026-10-02T19:07:17Z'::timestamptz,'invalido','859e0efe-cdf6-49f4-aab6-599906bfa24d'::uuid),
    ('177798',54180917414164,'2026-10-02T19:15:19Z'::timestamptz,'invalido','3144b8ab-d0d6-48c8-8f44-926d2206bca1'::uuid),
    ('177871',54246992510100,'2026-10-05T11:27:01Z'::timestamptz,'invalido','739ff180-744d-464b-a298-4265981afa92'::uuid),
    ('177876',54181006931348,'2026-10-02T19:17:34Z'::timestamptz,'invalido','e320396c-5726-4388-a118-6e96da30b06e'::uuid),
    ('177917',54183347859732,'2026-10-02T20:11:51Z'::timestamptz,'invalido','332cfc30-93d4-4529-9045-27abc3fddb2c'::uuid),
    ('177962',54246114422804,'2026-10-05T10:56:05Z'::timestamptz,'valido','5de843a8-36b0-4039-954b-8ac967659022'::uuid),
    ('177964',54246145563412,'2026-10-05T10:57:47Z'::timestamptz,'valido','15a2bba1-f371-4509-9cae-5a95eacaec1b'::uuid),
    ('177976',54246235701268,'2026-10-05T11:00:29Z'::timestamptz,'invalido','a70fcc17-87aa-4db1-8a71-498094a56cbb'::uuid),
    ('178320',54246417675540,'2026-10-05T11:07:07Z'::timestamptz,'invalido','b8cc2e8b-fc09-41b2-b6b2-86e2ca02f71f'::uuid),
    ('178329',54246589805076,'2026-10-05T11:11:26Z'::timestamptz,'invalido','a853f489-c106-4718-8c2a-01cd62b30fa2'::uuid),
    ('178330',54246674830612,'2026-10-05T11:15:22Z'::timestamptz,'invalido','9bbc0f5a-d58b-464c-84ee-2bc6cede026e'::uuid),
    ('178372',54247377250964,'2026-10-05T11:45:06Z'::timestamptz,'invalido','b0430ab3-85a1-4aa8-8426-7ded219be190'::uuid),
    ('178378',54247467279380,'2026-10-05T11:48:59Z'::timestamptz,'invalido','40414434-77e3-4516-a7a8-ef09db4c2418'::uuid),
    ('178382',54247489199124,'2026-10-05T11:50:27Z'::timestamptz,'invalido','39b8690f-e9c5-406e-b327-2044c09f8559'::uuid),
    ('178412',54262586131860,'2026-10-05T17:45:22Z'::timestamptz,'valido','4c44e29d-bb67-4068-94ec-d21433f67b40'::uuid),
    ('178432',54250414895636,'2026-10-05T13:18:26Z'::timestamptz,'valido','d5534201-e396-4350-9186-dc1c0be8c339'::uuid),
    ('178481',54249189059732,'2026-10-05T12:44:52Z'::timestamptz,'invalido','25f7cc3b-5e04-451b-b4fa-2c006ae97b38'::uuid),
    ('178484',54249169013012,'2026-10-05T12:45:57Z'::timestamptz,'invalido','9724bbe3-ff04-4735-a1e3-25ceca9f5573'::uuid),
    ('178491',54249202684052,'2026-10-05T12:46:59Z'::timestamptz,'valido','7802e069-b90d-49c4-bfa2-e9072e32f05d'::uuid),
    ('178509',54249481436180,'2026-10-05T12:55:08Z'::timestamptz,'invalido','dd6499c9-c1b3-4dce-9f32-ddaf707ddfb2'::uuid),
    ('178514',54249710623252,'2026-10-05T13:01:05Z'::timestamptz,'invalido','0c3c62d1-3ef3-47c5-bef1-3e18aba34fad'::uuid),
    ('178517',54289680237716,'2026-10-06T12:55:42Z'::timestamptz,'valido','8c1865d4-b0b3-4073-88fb-f3973bbaa02f'::uuid),
    ('178524',54250070212884,'2026-10-05T13:09:05Z'::timestamptz,'invalido','3015dda9-f93f-4bc9-9436-954ca0617783'::uuid),
    ('178531',54268539524756,'2026-10-05T19:59:18Z'::timestamptz,'valido','6b400233-4e70-4098-b447-2eaa57d36a44'::uuid),
    ('178537',54251628088596,'2026-10-05T13:49:02Z'::timestamptz,'valido','da71b095-9269-4a06-96d1-b79163a283d0'::uuid),
    ('178550',54250761201684,'2026-10-05T13:28:28Z'::timestamptz,'valido','f1246f32-4230-4418-a7bc-d3b66fcd341a'::uuid),
    ('178564',54250834479636,'2026-10-05T13:29:27Z'::timestamptz,'invalido','266406a4-caeb-4866-ab56-24ad889d380b'::uuid),
    ('178571',54250894395412,'2026-10-05T13:31:04Z'::timestamptz,'invalido','f21a850e-1f28-433a-949b-aa3f3f1c6237'::uuid),
    ('178585',54253591908628,'2026-10-05T14:32:04Z'::timestamptz,'invalido','389a9f2f-3ea3-4f97-9860-40a0b84a4dd7'::uuid),
    ('178595',54259854415764,'2026-10-05T16:45:07Z'::timestamptz,'invalido','ec4f2594-0b28-4ede-9ac0-db19159dbdda'::uuid),
    ('178596',54253713273876,'2026-10-05T14:34:50Z'::timestamptz,'invalido','59860f5e-5245-43c7-b276-722f4e8121b9'::uuid),
    ('178619',54252064163092,'2026-10-05T14:00:21Z'::timestamptz,'invalido','ba5217df-47cc-475c-8a14-cf340b8f8aa0'::uuid),
    ('178622',54288004615956,'2026-10-06T12:04:03Z'::timestamptz,'valido','46c94932-80eb-4bd2-8c22-31fd837b75c9'::uuid),
    ('178623',54262493736724,'2026-10-05T17:43:25Z'::timestamptz,'invalido','e57914b2-2de3-4a41-96cc-4d866482a3f9'::uuid),
    ('178643',54253782926868,'2026-10-05T14:35:45Z'::timestamptz,'invalido','5e8761cd-4605-4ba2-be28-ec9fa98f486b'::uuid),
    ('178653',54253569359252,'2026-10-05T14:31:08Z'::timestamptz,'invalido','74f78ed7-9f74-40a5-a2bd-555a0d15817a'::uuid),
    ('178666',54260315400212,'2026-10-05T16:56:01Z'::timestamptz,'valido','c25914d4-bc6f-44b0-bdba-e8b37ea96da0'::uuid),
    ('178669',54253943748756,'2026-10-05T14:38:45Z'::timestamptz,'invalido','bf5d63c6-a8ab-40cf-a6d1-67c55e8ccc48'::uuid),
    ('178701',54254005432980,'2026-10-05T14:40:06Z'::timestamptz,'invalido','d7b1d77f-fd92-4580-9593-05471b00204c'::uuid),
    ('178712',54259592493972,'2026-10-05T16:39:15Z'::timestamptz,'invalido','6c7d0c92-f221-4577-8cd9-368913a054e0'::uuid),
    ('178746',54259644817428,'2026-10-05T16:40:30Z'::timestamptz,'invalido','c3f66339-d93e-4366-a702-b4be068411f7'::uuid),
    ('178763',54265382428948,'2026-10-05T18:46:42Z'::timestamptz,'invalido','af775754-864a-4308-a593-1a9c065fd67f'::uuid),
    ('178765',54259815891988,'2026-10-05T16:43:31Z'::timestamptz,'invalido','f3722e0e-c897-4152-8a69-dfc64dade1e4'::uuid),
    ('178790',54265205691668,'2026-10-05T18:42:53Z'::timestamptz,'invalido','e690854d-e5db-4a31-bd2a-3e0ecbc593d3'::uuid),
    ('178797',54287339956884,'2026-10-06T11:37:42Z'::timestamptz,'valido','33a3e08a-6112-4a5d-98fd-dd14ca37175b'::uuid),
    ('178835',54260273571220,'2026-10-05T16:54:53Z'::timestamptz,'invalido','dd971497-62d0-4287-8a53-8f136182a78a'::uuid),
    ('178869',54286401674388,'2026-10-06T10:54:48Z'::timestamptz,'valido','99fb2560-4d38-488d-aeba-f864e9c327dd'::uuid),
    ('178894',54265414769812,'2026-10-05T18:48:02Z'::timestamptz,'valido','97dd4c30-9269-4022-bb71-de61886264b9'::uuid),
    ('178898',54265323057940,'2026-10-05T18:45:27Z'::timestamptz,'invalido','33a387c0-a7a1-44d7-a8bd-065a72d13b37'::uuid),
    ('178963',54287281021716,'2026-10-06T11:35:23Z'::timestamptz,'valido','566e8dd0-899a-4389-858a-377b7a38201e'::uuid),
    ('178971',54266655989652,'2026-10-05T19:14:26Z'::timestamptz,'valido','774ec61f-ba6a-428e-83ed-cc77f4f63b26'::uuid),
    ('179002',54287210778900,'2026-10-06T11:33:36Z'::timestamptz,'valido','09008803-28ed-481f-9c4e-a6c19fd7e755'::uuid),
    ('179010',54265470808340,'2026-10-05T18:48:51Z'::timestamptz,'valido','1cbdb90b-daf3-4e1e-9ded-bab29ca1f8ca'::uuid),
    ('179020',54265485100692,'2026-10-05T18:49:22Z'::timestamptz,'valido','76a37616-ca0d-4341-af4a-3945bbdca3b1'::uuid),
    ('179021',54266607441300,'2026-10-05T19:13:08Z'::timestamptz,'valido','5fe48beb-2e7e-4736-a115-4b10d09c4366'::uuid),
    ('179042',54266747201300,'2026-10-05T19:16:06Z'::timestamptz,'valido','2e456694-2f74-43f0-afbc-d1db76d4e029'::uuid),
    ('179044',54267214101780,'2026-10-05T19:27:11Z'::timestamptz,'valido','c8a6e5f8-d072-40b2-a8d1-3d2b595d6dd4'::uuid),
    ('179075',54267857381524,'2026-10-05T19:42:44Z'::timestamptz,'valido','ce893876-584b-47fe-91fe-1dfd1484ef9c'::uuid),
    ('179079',54267173969940,'2026-10-05T19:26:09Z'::timestamptz,'valido','425f7d43-c505-43c1-bb63-f17cb3959526'::uuid),
    ('179091',54267709325460,'2026-10-05T19:38:11Z'::timestamptz,'valido','180bf4bf-152d-4b9a-9f49-da70721d2c06'::uuid),
    ('179093',54267754630164,'2026-10-05T19:40:00Z'::timestamptz,'valido','5c612a84-133c-4052-a319-e80ed40a9c07'::uuid),
    ('179133',54268848218516,'2026-10-05T20:05:02Z'::timestamptz,'valido','3b336536-e223-49e6-b2bf-0f85eaefb225'::uuid),
    ('179136',54286323156244,'2026-10-06T10:49:36Z'::timestamptz,'valido','50059a84-6183-45bc-8341-87a8d8029ec9'::uuid),
    ('179165',54286294944276,'2026-10-06T10:48:42Z'::timestamptz,'valido','37af14ea-02df-427b-a474-3159a1a3cd50'::uuid),
    ('179214',54286390003092,'2026-10-06T10:56:45Z'::timestamptz,'valido','15e5a8d3-f894-40b1-b56e-8c396efd09fb'::uuid),
    ('179222',54286442344084,'2026-10-06T10:57:57Z'::timestamptz,'valido','b88326fc-33e7-4a74-a95d-ccf60f440f34'::uuid),
    ('179293',54287025661844,'2026-10-06T11:26:09Z'::timestamptz,'valido','a83c7529-30a1-4eff-b92f-f89368787fbf'::uuid),
    ('179321',54287052700436,'2026-10-06T11:27:29Z'::timestamptz,'invalido','f149dbba-5eb1-4afb-8e41-d0b661aed3a0'::uuid),
    ('179344',54290521779220,'2026-10-06T13:15:21Z'::timestamptz,'valido','ffb340a9-82d5-4d08-9530-f22522fe94ab'::uuid),
    ('179363',54289420694036,'2026-10-06T12:47:11Z'::timestamptz,'valido','76ca2ec4-5936-4d4a-8769-3246f0d20653'::uuid),
    ('179435',54289630913172,'2026-10-06T12:54:26Z'::timestamptz,'invalido','785ff5f7-9304-47d1-8559-87c9f169c66d'::uuid),
    ('179459',54290622225428,'2026-10-06T13:17:56Z'::timestamptz,'invalido','3359edff-74e9-4b92-86fb-e6bd5627061d'::uuid),
    ('179479',54290480796180,'2026-10-06T13:13:46Z'::timestamptz,'valido','d97e67c8-8029-4eda-9200-9774245bc690'::uuid),
    ('179580',54292280219412,'2026-10-06T13:56:36Z'::timestamptz,'valido','0dfcd6ff-7ba5-4ebf-becc-4f6f8cbdb32f'::uuid),
    ('179639',54299491477396,'2026-10-06T16:30:31Z'::timestamptz,'invalido','74d26070-5b5d-4ce0-9b97-b91bc65c1e3d'::uuid),
    ('179727',54299871130132,'2026-10-06T16:37:03Z'::timestamptz,'valido','f8cb00bd-3cf4-4015-b298-e9798842bef9'::uuid),
    ('179742',54299829134484,'2026-10-06T16:35:58Z'::timestamptz,'valido','f220ff93-31e6-47a0-9dba-75c7b7fc62c6'::uuid),
    ('179794',54302067804052,'2026-10-06T17:22:14Z'::timestamptz,'valido','a62b3e26-232d-47d5-aa02-2d7385de2333'::uuid),
    ('179872',54303436689172,'2026-10-06T17:51:54Z'::timestamptz,'valido','b838180a-17df-4d9c-a37f-38985c9c9151'::uuid),
    ('179950',54305950465556,'2026-10-06T18:46:35Z'::timestamptz,'invalido','ee21e570-4f2a-4d50-af5b-2f4a9c4ea9ea'::uuid)
  ) AS audited(ticket_id,zendesk_comment_id,zendesk_comment_at,verdict,original_job_id)
JOIN public.child_ai_legacy_jobs l ON l.ticket_id=audited.ticket_id
  AND l.original_job_id=audited.original_job_id
;

-- The normal PJ route applies to a current six-criterion evaluation. A signed
-- historical receipt is a different record type. Keep the exception narrow:
-- the marker must match an imported receipt and cannot be supplied by an
-- authenticated user during INSERT.
CREATE OR REPLACE FUNCTION public.enforce_pj_review_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_is_pj boolean;
BEGIN
  IF NEW.form_snapshot->>'legacy_source' = 'zendesk_child_note' THEN
    IF TG_OP = 'INSERT' THEN
      IF auth.role() = 'authenticated' OR NOT EXISTS (
        SELECT 1 FROM public.legacy_child_note_receipts r
        WHERE r.ticket_id = btrim(NEW.ticket_id)
          AND r.zendesk_comment_id::text = NEW.form_snapshot->>'legacy_comment_id'
          AND r.original_job_id::text = NEW.form_snapshot->>'legacy_original_job_id'
      ) THEN RAISE EXCEPTION 'Importação histórica sem recibo autorizado.'; END IF;
    ELSIF OLD.form_snapshot->>'legacy_source' IS DISTINCT FROM 'zendesk_child_note'
      OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
      OR NEW.form_snapshot->>'legacy_comment_id' IS DISTINCT FROM OLD.form_snapshot->>'legacy_comment_id'
      OR NEW.form_snapshot->>'legacy_original_job_id' IS DISTINCT FROM OLD.form_snapshot->>'legacy_original_job_id'
      OR NEW.form_snapshot->>'legacy_verdict' IS DISTINCT FROM OLD.form_snapshot->>'legacy_verdict'
      OR NEW.form_snapshot->'legacy_comment_at' IS DISTINCT FROM OLD.form_snapshot->'legacy_comment_at'
      OR NEW.form_snapshot->'legacy_original_score' IS DISTINCT FROM OLD.form_snapshot->'legacy_original_score'
      OR NEW.form_snapshot->'legacy_original_result' IS DISTINCT FROM OLD.form_snapshot->'legacy_original_result'
      OR NEW.form_snapshot->'legacy_six_criteria_draft' IS DISTINCT FROM OLD.form_snapshot->'legacy_six_criteria_draft'
      OR NEW.form_snapshot->'sections' IS DISTINCT FROM OLD.form_snapshot->'sections'
      OR NEW.answers IS DISTINCT FROM OLD.answers
      OR NEW.question_observations IS DISTINCT FROM OLD.question_observations
      OR NEW.score IS DISTINCT FROM OLD.score
      OR NEW.evaluator_note IS DISTINCT FROM OLD.evaluator_note THEN
      RAISE EXCEPTION 'Proveniência histórica não pode ser alterada.';
    END IF;
    NEW.pj_review_required := false;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.form_snapshot->>'legacy_source' = 'zendesk_child_note' THEN
    RAISE EXCEPTION 'Proveniência histórica não pode ser removida.';
  END IF;

  SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;
  IF TG_OP = 'INSERT' THEN
    NEW.pj_review_required := coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE);
    IF NOT coalesce(v_is_pj, false) THEN RETURN NEW; END IF;
    IF NEW.pj_reviewer_id IS NOT NULL OR NEW.pj_review_kind IS NOT NULL
      OR NEW.pj_review_decision IS NOT NULL OR NEW.pj_review_note IS NOT NULL
      OR NEW.pj_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'O parecer PJ não pode ser pré-preenchido.';
    END IF;
    IF NEW.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota inferior a 75 devem começar na revisão do gestor PJ.';
    ELSIF NOT NEW.pj_review_required AND NEW.status = 'pendente_revisao' THEN
      NEW.status := 'concluida';
      NEW.resolution_type := 'human';
      NEW.action_deadline_at := NULL;
      NEW.history := coalesce(NEW.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'Monitoria concluída automaticamente por nota positiva PJ',
        'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
        'note', 'Formulário anterior à atualização enviou status pendente; regra de nota positiva aplicada.'));
    ELSIF NOT NEW.pj_review_required AND NEW.status <> 'concluida' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota igual ou superior a 75 devem ser concluídas.';
    END IF;
    RETURN NEW;
  END IF;

  NEW.pj_review_required := OLD.pj_review_required
    OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE));
  IF OLD.pj_review_required AND OLD.active AND OLD.status='pendente_revisao'
    AND NEW.status='concluida' AND NEW.score=OLD.score
    AND NEW.resolution_type='automatic' AND OLD.action_deadline_at<now()
    AND OLD.form_snapshot->>'automation'='positive_csat'
    AND current_setting('app.positive_ai_timeout',true)=OLD.id::text
    AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated') THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;
  IF NOT OLD.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
    RAISE EXCEPTION 'Monitorias PJ que passaram a ter nota inferior a 75 devem iniciar revisão do gestor PJ.';
  END IF;

  IF NEW.status = 'pendente_revisao' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.pj_reviewer_id := NULL;
    NEW.pj_review_kind := NULL;
    NEW.pj_review_decision := NULL;
    NEW.pj_review_note := NULL;
    NEW.pj_reviewed_at := NULL;
  END IF;
  IF NEW.status = 'aguardando_revisao_pj' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'A etapa de revisão PJ foi encerrada; o parecer segue direto para a Qualidade.';
  END IF;
  IF OLD.status IS DISTINCT FROM 'pendente_revisao'
    AND NEW.status = 'pendente_revisao' THEN
    IF (SELECT auth.uid()) IS NOT NULL
      AND _private.current_active_role() NOT IN ('admin','gestor_qualidade','qualidade') THEN
      RAISE EXCEPTION 'Somente a Qualidade pode reiniciar o fluxo PJ.';
    END IF;
  ELSIF (NEW.pj_reviewer_id, NEW.pj_review_kind) IS DISTINCT FROM
    (OLD.pj_reviewer_id, OLD.pj_review_kind)
    AND (SELECT auth.uid()) IS NOT NULL
    AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'O tipo de parecer PJ só pode ser registrado pela ação do gestor.';
  END IF;
  IF (NEW.pj_review_decision, NEW.pj_review_note, NEW.pj_reviewed_at) IS DISTINCT FROM
    (OLD.pj_review_decision, OLD.pj_review_note, OLD.pj_reviewed_at)
    AND NEW.status <> 'pendente_revisao'
    AND (SELECT auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'A etapa de parecer do revisor PJ foi encerrada.';
  END IF;
  IF NEW.status = 'aguardando_gestor_qualidade' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status NOT IN ('pendente_revisao','aguardando_gestor_suporte','aguardando_revisao_pj')
      OR NEW.pj_review_kind IS NULL THEN
      RAISE EXCEPTION 'O parecer do gestor PJ deve preceder a Gestão da Qualidade.';
    END IF;
    IF OLD.status <> 'aguardando_revisao_pj'
      AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text
      AND (SELECT auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'Somente a ação do gestor PJ pode encaminhar à Qualidade.';
    END IF;
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada',
      'em_contestacao','reavaliacao_solicitada')
    AND OLD.status IS DISTINCT FROM NEW.status AND NEW.pj_review_kind IS NULL THEN
    RAISE EXCEPTION 'Monitoria PJ aguarda o parecer do gestor antes da decisão final.';
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status NOT IN ('aguardando_gestor_qualidade','reavaliacao_solicitada',
      'contestacao_negada','contestacao_aceita') THEN
    RAISE EXCEPTION 'A decisão da Qualidade deve preceder a conclusão PJ.';
  END IF;
  IF NEW.pj_review_kind = 'contestation'
    AND NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND coalesce(NEW.contestation_result, '') NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'A decisão final deve resolver a contestação PJ.';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
  v_result jsonb;
  v_snapshot jsonb;
  v_draft jsonb;
  v_answers jsonb;
  v_observations jsonb;
  v_questions jsonb;
  v_score numeric;
  v_agent_id uuid;
  v_agent_name text;
  v_auditor_id uuid;
  v_auditor_name text;
  v_team_id uuid;
  v_monitoria_id uuid;
BEGIN
  -- Fresh test/installation databases have no archived October jobs.
  IF NOT EXISTS (SELECT 1 FROM public.legacy_child_note_receipts) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.legacy_child_note_receipts) <> 132 THEN
    RAISE EXCEPTION 'Recorte histórico inesperado; importação cancelada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.forms WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f') THEN
    RAISE EXCEPTION 'Ficha de chamado filho indisponível.';
  END IF;
  FOR r IN
    SELECT receipt.*, l.original_job, q.ticket_snapshot, q.status AS queue_status,
      q.auditor_id, to_jsonb(d) AS current_draft
    FROM public.legacy_child_note_receipts receipt
    LEFT JOIN public.child_ai_legacy_jobs l ON l.ticket_id = receipt.ticket_id
      AND l.original_job_id = receipt.original_job_id
    LEFT JOIN public.child_ai_queue q ON q.ticket_id = receipt.ticket_id
    LEFT JOIN public.ai_evaluation_drafts d ON d.ticket_id = receipt.ticket_id
    ORDER BY receipt.ticket_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('child_ticket_' || r.ticket_id));
    IF EXISTS (SELECT 1 FROM public.monitorias m WHERE btrim(m.ticket_id) = r.ticket_id) THEN
      RAISE EXCEPTION 'Ticket % já ganhou monitoria; atualize a auditoria antes de importar.', r.ticket_id;
    END IF;
    IF r.original_job IS NULL OR r.ticket_snapshot IS NULL OR r.queue_status NOT IN ('review_required','blocked') THEN
      RAISE EXCEPTION 'Fontes incompletas ou fila alterada para ticket %.', r.ticket_id;
    END IF;
    v_result := r.original_job->'result';
    v_snapshot := r.ticket_snapshot;
    v_draft := r.current_draft;
    IF r.original_job->>'status' IS DISTINCT FROM 'completed'
      OR jsonb_typeof(v_result->'checks') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_result->'checks') <> 3
      OR jsonb_typeof(v_result->'score') IS DISTINCT FROM 'number'
      OR r.zendesk_comment_at <= (r.original_job->>'finished_at')::timestamptz
      OR r.zendesk_comment_at > (r.original_job->>'finished_at')::timestamptz + interval '5 minutes' THEN
      RAISE EXCEPTION 'Parecer ou comentário legado divergente para ticket %.', r.ticket_id;
    END IF;
    v_score := (v_result->>'score')::numeric;
    IF v_score < 0 OR v_score > 100 OR r.auditor_id IS NULL THEN
      RAISE EXCEPTION 'Nota ou auditor legado inválido para ticket %.', r.ticket_id;
    END IF;
    SELECT u.id, u.name INTO v_auditor_id, v_auditor_name
      FROM public.users u WHERE u.id = r.auditor_id;
    IF v_auditor_id IS NULL THEN RAISE EXCEPTION 'Auditor não encontrado para ticket %.', r.ticket_id; END IF;
    SELECT u.id, u.name, u.primary_team_id INTO v_agent_id, v_agent_name, v_team_id
      FROM public.users u
      WHERE u.id = nullif(v_snapshot->>'agent_id','')::uuid AND u.active;
    v_agent_name := coalesce(v_agent_name, v_snapshot->>'agent_name', 'Agente não identificado');

    SELECT jsonb_object_agg('legacy-check-' || ordinality,
        CASE WHEN value->>'passed' = 'true' THEN 'SIM' WHEN value->>'passed' = 'false' THEN 'NAO' ELSE 'NA' END),
      jsonb_object_agg('legacy-check-' || ordinality, coalesce(value->>'details','')),
      jsonb_agg(jsonb_build_object('id','legacy-check-' || ordinality,
        'text',coalesce(nullif(value->>'rule',''),'Critério legado ' || ordinality),
        'type','yes_no_na') ORDER BY ordinality)
    INTO v_answers, v_observations, v_questions
    FROM jsonb_array_elements(v_result->'checks') WITH ORDINALITY;

    INSERT INTO public.monitorias (
      form_id,evaluator_id,evaluated_id,team_id,ticket_id,channel,ticket_date,analysis_date,
      satisfaction_result,answers,question_observations,score,status,active,evaluator_note,
      form_snapshot,history,evaluator_name,evaluated_name,form_name,concluded_at
    ) VALUES (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f',v_auditor_id,v_agent_id,v_team_id,r.ticket_id,
      coalesce(nullif(v_snapshot->>'channel',''),'Email'),
      nullif(v_snapshot->>'ticket_date','')::timestamptz::date,
      (r.zendesk_comment_at AT TIME ZONE 'America/Sao_Paulo')::date,
      'Sem pesquisa',v_answers,v_observations,v_score,'concluida',true,
      'Parecer histórico importado do comentário interno Zendesk #' || r.zendesk_comment_id || E'\n\n'
        || coalesce(v_result->>'summary','Sem resumo no job legado.'),
      jsonb_build_object(
        'id','6c7d1e88-841b-4da9-9a66-9f1464ce896f',
        'title','Chamado filho — parecer histórico legado (3 critérios)',
        'ticket_kind','chamado_filho','legacy_source','zendesk_child_note',
        'legacy_verdict',r.verdict,'legacy_comment_id',r.zendesk_comment_id::text,
        'legacy_comment_at',r.zendesk_comment_at,'legacy_original_job_id',r.original_job_id::text,
        'legacy_original_score',v_score,'legacy_original_result',v_result,
        'legacy_six_criteria_draft',v_draft,
        'legacy_agent_identity_unresolved',v_agent_id IS NULL,
        'sections',jsonb_build_array(jsonb_build_object('id','legacy-section','title','Critérios do parecer antigo',
          'weight',100,'questions',v_questions))
      ),
      jsonb_build_array(jsonb_build_object('action','Parecer histórico importado',
        'by_id',null,'by_name','Sistema','at',now(),
        'note','Veredito ' || upper(r.verdict) || ' já publicado como nota interna Zendesk #'
          || r.zendesk_comment_id || '. Ficha antiga de 3 critérios; a ficha atual de 6 critérios não foi preenchida.')),
      v_auditor_name,v_agent_name,'Chamado filho — parecer histórico legado',r.zendesk_comment_at
    ) RETURNING id INTO v_monitoria_id;
    UPDATE public.legacy_child_note_receipts
      SET monitoria_id=v_monitoria_id,imported_at=now() WHERE ticket_id=r.ticket_id;
    UPDATE public.child_ai_queue
      SET status='completed',monitoria_id=v_monitoria_id,score=v_score,last_error=NULL,
        evaluation_payload=NULL,updated_at=now()
      WHERE ticket_id=r.ticket_id;
  END LOOP;
  IF (SELECT count(*) FROM public.legacy_child_note_receipts WHERE monitoria_id IS NOT NULL) <> 132 THEN
    RAISE EXCEPTION 'Importação incompleta; transação cancelada.';
  END IF;
END $$;

COMMIT;
