-- SLA range settings (mirror OC_floor / OC_ceiling)
INSERT INTO public."SystemSettings" ("Key", "Value", "UpdatedBy", "CreatedAt", "UpdatedAt")
VALUES
    ('SLA_floor', '0.9950', 'migration', NOW(), NOW()),
    ('SLA_ceiling', '0.9956', 'migration', NOW(), NOW())
ON CONFLICT ("Key") DO NOTHING;

-- Persist applied factors on each CL reward row
ALTER TABLE public."CLRewards" ADD COLUMN IF NOT EXISTS sla numeric(24, 8);
ALTER TABLE public."CLRewards" ADD COLUMN IF NOT EXISTS oc numeric(24, 8);

-- Legacy single SLA setting (replaced by SLA_floor / SLA_ceiling)
DELETE FROM public."SystemSettings" WHERE "Key" = 'SLA_value';
