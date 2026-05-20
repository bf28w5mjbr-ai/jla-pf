-- Make QualificationTemplate.description human-facing only.
-- Structured metadata lives in dedicated columns such as domain, level, minAge,
-- prerequisiteExpression, prerequisiteKinds, and nextKinds.

WITH human_descriptions(kind, description) AS (
  VALUES
    (
      'Instructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    ),
    (
      'BLSAssistantInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview' || chr(10) ||
      'Additional requirements: can demonstrate BLS skills' || chr(10) ||
      'Training hours: 28'
    ),
    (
      'BLSInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    ),
    (
      'WaterSafetyAssistantInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview' || chr(10) ||
      'Additional requirements: experience in rescue or instruction (>=1 year)' || chr(10) ||
      'Training hours: 14'
    ),
    (
      'WaterSafetyInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    ),
    (
      'SurfAssistantInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview' || chr(10) ||
      'Additional requirements: practical rescue experience' || chr(10) ||
      'Training hours: 21'
    ),
    (
      'SurfInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    ),
    (
      'PoolAssistantInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview' || chr(10) ||
      'Additional requirements: practical pool rescue experience' || chr(10) ||
      'Training hours: 21'
    ),
    (
      'PoolInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    ),
    (
      'IRBAssistantInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview' || chr(10) ||
      'Additional requirements: IRB operational experience' || chr(10) ||
      'Training hours: 14'
    ),
    (
      'IRBInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    ),
    (
      'JuniorAssistantInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview' || chr(10) ||
      'Additional requirements: junior instruction experience' || chr(10) ||
      'Training hours: 14'
    ),
    (
      'JuniorInstructor',
      'Instructor requirements include: physically and mentally fit | complies with JLA regulations | valid certifications held | has contributed or can contribute to lifesaving activities | medical check within 1 year' || chr(10) ||
      'Certification rules: only BLS held: at least one renewal | multiple certifications held: at least 1 year since last certification' || chr(10) ||
      'Evaluation: written exam | practical exam | interview'
    )
)
UPDATE "QualificationTemplate" AS qt
SET
  description = hd.description,
  "updatedAt" = CURRENT_TIMESTAMP
FROM human_descriptions AS hd
WHERE qt.kind = hd.kind;

-- CTE scope is limited to the single statement above; list kinds explicitly here.
UPDATE "QualificationTemplate" AS qt
SET
  description = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE qt.kind NOT IN (
  'Instructor',
  'BLSAssistantInstructor',
  'BLSInstructor',
  'WaterSafetyAssistantInstructor',
  'WaterSafetyInstructor',
  'SurfAssistantInstructor',
  'SurfInstructor',
  'PoolAssistantInstructor',
  'PoolInstructor',
  'IRBAssistantInstructor',
  'IRBInstructor',
  'JuniorAssistantInstructor',
  'JuniorInstructor'
);
