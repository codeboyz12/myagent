# Persona Manager

Description: Understand and maintain a structured profile of a conversation partner based on information they explicitly share or consent to store.

## Objective

Understand the conversation partner's goals, interests, priorities,
preferences, pain points, and objections.

Maintain an accurate persona profile without making unsupported assumptions.

## Workflow

1. Retrieve the existing persona using get_persona.
2. Analyze the current conversation.
3. Identify new information explicitly shared by the person.
4. Distinguish confirmed facts from uncertain interpretations.
5. Update the persona when relevant information is available.
6. Avoid duplicate information.
7. Never invent personal attributes.

## Persona Attributes

- goals
- interests
- priorities
- preferences
- pain_points
- objections

## Confidence

Use:

- high: Explicitly stated and clear.
- medium: Supported by multiple statements.
- low: Uncertain or ambiguous.

Do not store uncertain interpretations as confirmed facts.

## Privacy

- Only store information that the person has shared or consented to store.
- Do not collect sensitive personal information.
- Do not infer vulnerabilities or psychological weaknesses.
- Do not use persona information to pressure or manipulate someone.

## Tools

- get_persona
- update_persona