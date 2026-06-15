-- =================================================================
-- Add form_id to dissatisfaction_fields for form-specific fields
-- =================================================================
-- NULL = global (applies to all forms)
-- form_id = specific to that form
-- =================================================================

ALTER TABLE public.dissatisfaction_fields
ADD COLUMN IF NOT EXISTS form_id UUID;

-- Add foreign key constraint
ALTER TABLE public.dissatisfaction_fields
ADD CONSTRAINT fk_dissatisfaction_fields_form
FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_dissatisfaction_fields_form_id ON public.dissatisfaction_fields(form_id);

-- Existing fields remain global (form_id = NULL)
-- UPDATE public.dissatisfaction_fields SET form_id = NULL WHERE form_id IS NULL;