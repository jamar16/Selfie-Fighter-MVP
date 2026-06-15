import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const supabaseEnabled = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = supabaseEnabled
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Pulls move names from recently generated fighters so new movesets avoid exact repeats.
async function getRecentMoveNames(limit = 60) {
  if (!supabaseEnabled) return [];
  const { data, error } = await supabase
    .from('fighters')
    .select('moves')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const names = new Set();
  for (const row of data) {
    for (const move of row.moves || []) {
      if (move?.name) names.add(move.name);
    }
  }
  return [...names];
}

// Calls Claude with a list of move names to avoid, retrying once if the
// result still collides with an existing name.
async function generateWithAntiDuplication(buildPrompt, schema) {
  let avoidNames = await getRecentMoveNames();
  let result = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.parse({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(avoidNames) }],
      output_config: { format: zodOutputFormat(schema) },
    });

    result = response.parsed_output;
    if (!result) continue;

    const avoidLower = new Set(avoidNames.map((n) => n.toLowerCase()));
    const collision = result.moves.some((m) => avoidLower.has(m.name.toLowerCase()));
    if (!collision) break;

    avoidNames = [...avoidNames, ...result.moves.map((m) => m.name)];
  }

  return result;
}

const CREATIVITY_RULES = `Push hard for originality: invent move names and flavor text that feel specific to this character — avoid generic, overused fighting-game terms ("Strike", "Combo", "Smash", "Blast", "Slam") as standalone names. Lean into unexpected, vivid details.`;

function buildAvoidClause(avoidNames) {
  if (!avoidNames.length) return '';
  return `\n\nThe following move names already exist elsewhere in this game's roster — do not reuse any of them, even with minor tweaks (different capitalization, pluralization, or synonyms count as reuse). Invent something fresh:\n${avoidNames.join(', ')}`;
}

const MoveSchema = z.object({
  name: z.string(),
  description: z.string(),
  damage: z.number().int().min(5).max(40),
  canBlock: z.boolean(),
  canCounter: z.boolean(),
});

const MovesetSchema = z.object({
  moves: z.array(MoveSchema).length(4),
});

const OpponentSchema = z.object({
  name: z.string(),
  avatar: z.string(),
  moves: z.array(MoveSchema).length(4),
});

const OPPONENT_ARCHETYPES = [
  'a scrappy street brawler from the docks',
  'a disciplined martial arts monk',
  'a flashy circus acrobat',
  'a grizzled retired boxer making a comeback',
  'a chaotic inventor armed with janky gadgets',
  'a stoic samurai swordsman',
  'a hot-headed rookie wrestler',
  'a sly street magician who relies on misdirection',
  'a heavily armored knight',
  'a nimble parkour runner',
  'a musclebound powerlifter',
  'a mysterious masked luchador',
  'an elemental spirit of fire, ice, or lightning',
  'a scrappy combat drone fresh off the assembly line',
  'a swashbuckling pirate captain',
  'a stage-trained kung-fu movie stuntman',
];

app.post('/generate-moves', async (req, res) => {
  const { sports, bestSkill, hobbies, personality } = req.body;

  if (!sports || !bestSkill || !hobbies || !personality) {
    return res.status(400).json({ error: 'Missing required bio fields.' });
  }

  try {
    const result = await generateWithAntiDuplication(
      (avoidNames) => `Create a 4-move combat moveset for a fighting game character based on this person's bio:

Sports/athletic background: ${sports}
Best skill: ${bestSkill}
Hobbies: ${hobbies}
Personality: ${personality}

Each move should be thematically tied to their bio - draw the name and description directly from these details. Damage values should range from 5 (light/fast moves) to 40 (heavy/slow moves), with most moves in the 10-25 range. Exactly one move is their signature move and should have canCounter: true; the other three should have canCounter: false. All moves should have canBlock: true unless a move is specifically designed to break through blocks, in which case canBlock: false - at most one move should have canBlock: false.

${CREATIVITY_RULES}${buildAvoidClause(avoidNames)}`,
      MovesetSchema
    );

    if (!result) {
      return res.status(502).json({ error: 'Claude did not return a valid moveset.' });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate moveset.' });
  }
});

app.post('/generate-opponent', async (req, res) => {
  const archetype = OPPONENT_ARCHETYPES[Math.floor(Math.random() * OPPONENT_ARCHETYPES.length)];

  try {
    const result = await generateWithAntiDuplication(
      (avoidNames) => `Invent an original opponent for a casual block/counter fighting game. Archetype to draw from: ${archetype}. Give them a punchy, thematic name and pick a single emoji that represents them. Then create a 4-move moveset for them.

Each move's name and description should be thematically tied to the character. Damage values should range from 5 (light/fast moves) to 40 (heavy/slow moves), with most moves in the 10-25 range. Exactly one move is their signature move and should have canCounter: true; the other three should have canCounter: false. All moves should have canBlock: true unless a move is specifically designed to break through blocks, in which case canBlock: false - at most one move should have canBlock: false.

${CREATIVITY_RULES}${buildAvoidClause(avoidNames)}`,
      OpponentSchema
    );

    if (!result) {
      return res.status(502).json({ error: 'Claude did not return a valid opponent.' });
    }

    if (supabaseEnabled) {
      const { error } = await supabase
        .from('fighters')
        .insert({ kind: 'opponent', name: result.name, avatar: result.avatar, moves: result.moves });
      if (error) console.error('Failed to save opponent:', error);
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate opponent.' });
  }
});

app.post('/fighters', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Persistence is not configured.' });
  }

  const { name, avatar, bio, moves } = req.body;
  if (!name || !Array.isArray(moves) || moves.length !== 4) {
    return res.status(400).json({ error: 'A fighter name and 4 moves are required.' });
  }

  const { data, error } = await supabase
    .from('fighters')
    .insert({ kind: 'player', name, avatar: avatar || null, bio: bio || null, moves })
    .select('id, created_at')
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to save fighter.' });
  }

  res.json(data);
});

app.get('/fighters/recent', async (req, res) => {
  if (!supabaseEnabled) return res.json({ fighters: [] });

  const kind = req.query.kind === 'opponent' ? 'opponent' : 'player';
  const { data, error } = await supabase
    .from('fighters')
    .select('id, name, avatar, moves, bio, created_at')
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load fighters.' });
  }

  res.json({ fighters: data });
});

app.get('/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
});

app.post('/matches', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Persistence is not configured.' });
  }

  const { fighter } = req.body;
  if (!fighter || !fighter.name || !Array.isArray(fighter.moves) || fighter.moves.length !== 4) {
    return res.status(400).json({ error: 'A fighter with a name and 4 moves is required.' });
  }

  const { data, error } = await supabase
    .from('matches')
    .insert({ player1_fighter: fighter })
    .select('id')
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create match.' });
  }

  res.json({ id: data.id });
});

app.post('/matches/:id/join', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Persistence is not configured.' });
  }

  const { fighter } = req.body;
  if (!fighter || !fighter.name || !Array.isArray(fighter.moves) || fighter.moves.length !== 4) {
    return res.status(400).json({ error: 'A fighter with a name and 4 moves is required.' });
  }

  const { data, error } = await supabase
    .from('matches')
    .update({ player2_fighter: fighter, status: 'active' })
    .eq('id', req.params.id)
    .eq('status', 'waiting')
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Match not found, or it already has two players.' });
  }

  res.json(data);
});

app.get('/matches/:id', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Persistence is not configured.' });
  }

  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  res.json(data);
});

app.post('/matches/:id/pick', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Persistence is not configured.' });
  }

  const { player, attackIdx, guessIdx, turn } = req.body;
  if (![1, 2].includes(player) || !Number.isInteger(attackIdx) || !Number.isInteger(guessIdx) || !Number.isInteger(turn)) {
    return res.status(400).json({ error: 'Invalid pick.' });
  }

  const { data: match, error: fetchErr } = await supabase
    .from('matches')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found.' });
  }
  if (match.status !== 'active') {
    return res.status(409).json({ error: 'Match is not active.' });
  }
  if (match.turn !== turn) {
    return res.status(409).json({ error: 'This turn has already been resolved.' });
  }

  const pickField = player === 1 ? 'player1_pick' : 'player2_pick';
  if (match[pickField]) {
    return res.status(409).json({ error: 'You already picked this turn.' });
  }

  const { data: afterPick, error: pickErr } = await supabase
    .from('matches')
    .update({ [pickField]: { attackIdx, guessIdx } })
    .eq('id', req.params.id)
    .eq('turn', turn)
    .is(pickField, null)
    .select()
    .single();

  if (pickErr || !afterPick) {
    return res.status(409).json({ error: 'Could not record pick — try again.' });
  }

  if (afterPick.player1_pick && afterPick.player2_pick) {
    await resolveTurn(req.params.id, afterPick);
  }

  res.json({ ok: true });
});

function resolveAttack(attackerMove, defenderGuessMove) {
  const readPerfectly = attackerMove.canCounter && defenderGuessMove && defenderGuessMove.name === attackerMove.name;

  if (readPerfectly) {
    return { toDefender: 0, toAttacker: attackerMove.damage, punished: true };
  }
  if (attackerMove.canBlock) {
    return { toDefender: Math.round(attackerMove.damage * 0.5), toAttacker: 0, punished: false };
  }
  return { toDefender: attackerMove.damage, toAttacker: 0, punished: false };
}

function describeAttack(attackerName, defenderName, move, result) {
  if (result.punished) {
    return `${defenderName} read ${attackerName}'s ${move.name} coming and turned it back on them for ${result.toAttacker} dmg!`;
  }
  if (!move.canBlock) {
    return `${attackerName} used ${move.name} — unblockable! ${defenderName} takes ${result.toDefender} dmg.`;
  }
  return `${attackerName} used ${move.name} — ${defenderName} blocks, taking ${result.toDefender} dmg.`;
}

async function resolveTurn(matchId, match) {
  const p1 = match.player1_fighter;
  const p2 = match.player2_fighter;
  const p1Attack = p1.moves[match.player1_pick.attackIdx];
  const p1Guess = p2.moves[match.player1_pick.guessIdx];
  const p2Attack = p2.moves[match.player2_pick.attackIdx];
  const p2Guess = p1.moves[match.player2_pick.guessIdx];

  const r1to2 = resolveAttack(p1Attack, p2Guess);
  const r2to1 = resolveAttack(p2Attack, p1Guess);

  const newP1HP = Math.max(0, match.player1_hp - (r2to1.toDefender + r1to2.toAttacker));
  const newP2HP = Math.max(0, match.player2_hp - (r1to2.toDefender + r2to1.toAttacker));

  const log = [
    describeAttack(p2.name, p1.name, p2Attack, r2to1),
    describeAttack(p1.name, p2.name, p1Attack, r1to2),
    ...match.log,
  ];

  let status = match.status;
  let winner = null;
  if (newP1HP <= 0 || newP2HP <= 0) {
    status = 'done';
    if (newP1HP <= 0 && newP2HP <= 0) winner = 'draw';
    else winner = newP1HP <= 0 ? 'player2' : 'player1';
  }

  const { error } = await supabase
    .from('matches')
    .update({
      player1_hp: newP1HP,
      player2_hp: newP2HP,
      player1_pick: null,
      player2_pick: null,
      turn: match.turn + 1,
      log,
      status,
      winner,
    })
    .eq('id', matchId)
    .eq('turn', match.turn);

  if (error) console.error('Failed to resolve turn:', error);
}

app.get('/fighters/:id', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Persistence is not configured.' });
  }

  const { data, error } = await supabase
    .from('fighters')
    .select('id, name, avatar, moves, bio, created_at')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Fighter not found.' });
  }

  res.json(data);
});

app.post('/generate-portrait', upload.single('selfie'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No selfie uploaded.' });
  }

  const { sports, bestSkill, hobbies, personality } = req.body;
  const bioLine = [sports, bestSkill, hobbies, personality].filter(Boolean).join('. ');

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: [
        {
          text: `Transform this selfie into a vibrant anime/manga fighting-game character portrait — dynamic hero splash art, dramatic lighting, bold linework. Keep the person's facial features, hairstyle, and likeness clearly recognizable, just restyled as anime art.${bioLine ? ` Let their fighting persona inform the styling: ${bioLine}.` : ''}`,
        },
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: req.file.buffer.toString('base64'),
          },
        },
      ],
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData);

    if (!imagePart) {
      return res.status(502).json({ error: 'Gemini did not return an image.' });
    }

    res.json({
      image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate portrait.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Selfie Fighter MVP running on http://localhost:${PORT}`));
