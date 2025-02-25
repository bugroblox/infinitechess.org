
/**
 * This script handles checkmate practice logic
 */


import type { CoordsKey } from '../../chess/util/coordutil.js';
import type { Position } from '../../chess/variants/variant.js';
import type { VariantOptions } from './gameslot.js';


import localstorage from '../../util/localstorage.js';
import colorutil from '../../chess/util/colorutil.js';
import coordutil from '../../chess/util/coordutil.js';
import gameslot from './gameslot.js';
import guipractice from '../gui/guipractice.js';
import variant from '../../chess/variants/variant.js';
import gameloader from './gameloader.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import movesequence from "../chess/movesequence.js";
import selection from '../chess/selection.js';
import guigameinfo from '../gui/guigameinfo.js';
import animation from '../rendering/animation.js';
// @ts-ignore
import winconutil from '../../chess/util/winconutil.js';
// @ts-ignore
import enginegame from '../misc/enginegame.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';


// Variables ----------------------------------------------------------------------------

const validCheckmates = {
	easy: [
		"2Q-1k",
		"3R-1k",
		"1Q1R1B-1k",
		"1Q1R1N-1k",
		"1K2R-1k",
		"1Q1CH-1k",
		"2CH-1k",
		"3B3B-1k",
		"1K2B2B-1k",
		"3AR-1k",
		"1K1AM-1k"
	],
	medium: [
		"1K1Q1B-1k",
		"1K1Q1N-1k",
		"1Q1B1B-1k",
		"1Q1B1N-1k",
		"1Q2N-1k",
		"1K1N2B1B-1k",
		"1K2N1B1B-1k",
		"1K1R1B1B-1k",
		"1K1R1N1B-1k",
		"1K1AR1R-1k",
		"1K2AR-1k",
		"2AM-1rc"
	],
	hard: [
		"2R1N1P-1k",
		"1K1R2N-1k",
		"2K1R-1k",
		"1K2N6B-1k",
		"1K1B2HA-1k",
		"1K1CH1N-1k",
		"5HU-1k",
	],
	insane: [
		"1K1Q1P-1k",
		"1K3HA-1k",
		"1K3NR-1k",
	]

	// superhuman (way too hard):
	// "1K1AR1HA1P-1k" (the white pawn only exists in order to mitigate zugzwang for white)
	// "2B60N-1k" (fewer knights suffice but exact amount unknown, see proof in https://chess.stackexchange.com/q/45998/35006 )
};

/** These checkmates we may place the black king nearer to the white pieces. */
const checkmatesWithBlackRoyalNearer = [
	"1K1Q1N-1k",
	"1Q1R1N-1k",
	"1Q2N-1k",
	"1Q1B1N-1k",
	"1K1N2B1B-1k",
	"1K2N1B1B-1k",
	"1K1R1N1B-1k",
	"1K1AR1R-1k",
	"1K1CH1N-1k",
	"1K1R2N-1k",
	"2K1R-1k",
	"1K2N6B-1k",
	"1K1B2HA-1k",
	"1K3HA-1k"
];

const nameOfCompletedCheckmatesInStorage: string = 'checkmatePracticeCompletion';
/**
 * A list of checkmate strings we have beaten
 * [ "2Q-1k", "3R-1k", "2CH-1k"]
 * 
 * This will be initialized when guipractice calls {@link getCompletedCheckmates} for the first time!
 * If we initialize it right here, we crash in production, because localstorage is not defined yet in app.js
 * @type {string[]}
 */
let completedCheckmates: string[];
const expiryOfCompletedCheckmatesMillis: number = 1000 * 60 * 60 * 24 * 365; // 1 year



/** Whether we are in a checkmate practice engine game. */
let inCheckmatePractice: boolean = false;

/** Whether the player is allowed to undo a move in the current position. */
let undoingIsLegal : boolean = false;


// Functions ----------------------------------------------------------------------------

function setUndoingIsLegal(value: boolean) {
	undoingIsLegal = value;
	guigameinfo.update_GameControlButtons(value);
}

function areInCheckmatePractice(): boolean {
	return inCheckmatePractice;
}

/**
 * Starts a checkmate practice game
 */
function startCheckmatePractice(checkmateSelectedID: string): void {
	console.log("Loading practice checkmate game.");
	inCheckmatePractice = true;
	setUndoingIsLegal(false);
	initListeners();

	const startingPosition = generateCheckmateStartingPosition(checkmateSelectedID);
	const specialRights = {};
	const positionString = formatconverter.LongToShort_Position(startingPosition, specialRights);
	const variantOptions: VariantOptions = {
		fullMove: 1,
		startingPosition,
		positionString,
		specialRights,
		gameRules: variant.getBareMinimumGameRules()
	};

	const options = {
		Event: 'Infinite chess checkmate practice',
		youAreColor: 'white' as 'white',
		currentEngine: 'engineCheckmatePractice' as 'engineCheckmatePractice',
		engineConfig: { checkmateSelectedID: checkmateSelectedID, engineTimeLimitPerMoveMillis: 500 },
		variantOptions
	};

	gameloader.startEngineGame(options);
}

function onGameUnload(): void {
	closeListeners();
	inCheckmatePractice = false;
	setUndoingIsLegal(false);
}

function initListeners() {
	document.addEventListener("guigameinfo-undoMove", undoMove);
	document.addEventListener("guigameinfo-restart", restartGame);
}

function closeListeners() {
	document.removeEventListener("guigameinfo-undoMove", undoMove);
	document.removeEventListener("guigameinfo-restart", restartGame);
}

function getCompletedCheckmates(): string[] {
	if (!completedCheckmates) completedCheckmates = localstorage.loadItem(nameOfCompletedCheckmatesInStorage) || []; // Initialize
	return completedCheckmates;
}

/**
 * This method generates a random starting position object for a given checkmate practice ID
 * @param checkmateID - a string containing the ID of the selected checkmate practice problem
 * @returns a starting position object corresponding to that ID
 */
function generateCheckmateStartingPosition(checkmateID: string): Position {
	// error if user somehow submitted invalid checkmate ID
	if (!Object.values(validCheckmates).flat().includes(checkmateID)) throw Error("User tried to play invalid checkmate practice.");

	// place the black king not so far away for specific variants
	const blackroyalnearer: boolean = checkmatesWithBlackRoyalNearer.includes(checkmateID);

	const startingPosition: { [key: string]: string } = {}; // the position to be generated
	let blackpieceplaced: boolean = false; // monitors if a black piece has already been placed
	let whitebishopparity: number = Math.floor(Math.random() * 2); // square color of first white bishop batch
	
	// read the elementID and convert it to a position
	const piecelist: RegExpMatchArray | null = checkmateID.match(/[0-9]+[a-zA-Z]+/g);
	if (!piecelist) return startingPosition;

	for (const entry of piecelist) {
		let amount: number = parseInt(entry.match(/[0-9]+/)![0]); // number of pieces to be placed
		let piece: string = entry.match(/[a-zA-Z]+/)![0]; // piecetype to be placed
		piece = formatconverter.ShortToLong_Piece(piece);

		// place amount many pieces of type piece
		while (amount !== 0) {
			if (colorutil.getPieceColorFromType(piece) === "white") {
				if (blackpieceplaced) throw Error("Must place all white pieces before placing black pieces.");

				// randomly generate white piece coordinates in square around origin
				const x: number = Math.floor(Math.random() * (blackroyalnearer ? 7 : 11)) - (blackroyalnearer ? 3 : 5);
				const y: number = Math.floor(Math.random() * (blackroyalnearer ? 7 : 11)) - (blackroyalnearer ? 3 : 5);
				const key: string = coordutil.getKeyFromCoords([x,y]);

				// check if square is occupied and white bishop parity is fulfilled
				if (!(key in startingPosition) && !(piece === "bishopsW" && (x + y) % 2 !== whitebishopparity)) {
					startingPosition[key] = piece;
					amount -= 1;
				}
			} else {
				// randomly generate black piece coordinates at a distance
				const x: number = Math.floor(Math.random() * 3) + (blackroyalnearer ? 8 : 12);
				const y: number = Math.floor(Math.random() * (blackroyalnearer ? 17 : 35)) - (blackroyalnearer ? 9 : 17);
				const key: CoordsKey = coordutil.getKeyFromCoords([x,y]);
				// check if square is occupied or potentially threatened
				if (!(key in startingPosition) && squareNotInSight(key, startingPosition)) {
					startingPosition[key] = piece;
					amount -= 1;
					blackpieceplaced = true;
				}
			}
		}

		// flip white bishop parity
		whitebishopparity = 1 - whitebishopparity;
	}

	return startingPosition;
}

/**
 * This method checks that the input square is not on the same row, column or diagonal as any key in the startingPosition object
 * It also checks that it is not attacked by a knightrider
 * @param square - square of black piece
 * @param startingPosition - startingPosition JSON containing all white pieces
 * @returns true or false, depending on if the square is in sight or not
 */
function squareNotInSight(square: CoordsKey, startingPosition: Position): boolean {
	const [sx, sy]: number[] = coordutil.getCoordsFromKey(square);
	for (const key in startingPosition) {
		const [x, y]: number[] = coordutil.getCoordsFromKey(key as CoordsKey);
		if (x === sx || y === sy || Math.abs(sx - x) === Math.abs(sy - y)) return false;
		if (startingPosition[key] === "knightridersW") {
			if (Math.abs(sx - x) === 2 * Math.abs(sy - y) || 2 * Math.abs(sx - x) === Math.abs(sy - y)) {
				return false;
			}
		}
	}
	return true;
}

/** Saves the list of beaten checkmates into browser storages. */
function saveCheckmatesBeaten(): void {
	if (!completedCheckmates) throw Error("Cannot save checkmates beaten when it was never initialized!");
	localstorage.saveItem(nameOfCompletedCheckmatesInStorage, completedCheckmates, expiryOfCompletedCheckmatesMillis);
}

function markCheckmateBeaten(checkmatePracticeID: string): void {
	if (!completedCheckmates) throw Error("Cannot mark checkmate beaten when it was never initialized!");

	// Add the checkmate ID to the beaten list
	if (!completedCheckmates.includes(checkmatePracticeID)) completedCheckmates.push(checkmatePracticeID);
	saveCheckmatesBeaten();
	console.log("Marked checkmate practice as completed!");
}

/** Completely for dev testing, call {@link checkmatepractice.eraseCheckmatePracticeProgress} in developer tools! */
function eraseCheckmatePracticeProgress(): void {
	localstorage.deleteItem(nameOfCompletedCheckmatesInStorage);
	console.log("DELETED all checkmate practice progress.");
	if (!completedCheckmates) return; // Haven't open the checkmate practice menu yet, so it's not defined.
	completedCheckmates.length = 0;
	guipractice.updateCheckmatesBeaten(); // Delete the 'beaten' class from all
}

/** Called when an engine game ends */
function onEngineGameConclude(): void {
	// Were we doing checkmate practice
	if (!inCheckmatePractice) return; // Not in checkmate practice

	const gameConclusion: string | false = gameslot.getGamefile()!.gameConclusion;
	if (gameConclusion === false) throw Error('Game conclusion is false, should not have called onEngineGameConclude()');

	// Did we win or lose?
	const victor: string | undefined = winconutil.getVictorAndConditionFromGameConclusion(gameConclusion).victor;
	if (victor === undefined) throw Error('Victor should never be undefined when concluding an engine game.');
	if (!enginegame.areWeColor(victor)) return; // Lost

	// WON!!! 🎉

	// Add the checkmate to the list of completed!
	const checkmatePracticeID: string = guipractice.getCheckmateSelectedID();
	markCheckmateBeaten(checkmatePracticeID);
}

/**
 * This function gets called by enginegame.ts whenever a human player submitted a move
 */
function registerHumanMove() {
	if (!inCheckmatePractice) return; // The engine game is not a checkmate practice game

	const gamefile = gameslot.getGamefile()!;
	if (!undoingIsLegal && gamefileutility.isGameOver(gamefile) && gamefile.moves.length > 0) {
		// allow player to undo move if it ended the game
		setUndoingIsLegal(true);
	} else if (undoingIsLegal && !gamefileutility.isGameOver(gamefile)) {
		// don't allow player to undo move while engine thinks
		setUndoingIsLegal(false);
	}
}

/**
 * This function gets called by enginegame.ts whenever an engine player submitted a move
 */
function registerEngineMove() {
	if (!inCheckmatePractice) return; // The engine game is not a checkmate practice game

	const gamefile = gameslot.getGamefile()!;
	if (!undoingIsLegal && gamefile.moves.length > 1) {
		// allow player to undo move after engine has moved
		setUndoingIsLegal(true);
	}
}

function undoMove() {
	if (!inCheckmatePractice) return console.error("Undoing moves is currently not allowed for non-practice mode games");
	const gamefile = gameslot.getGamefile()!;
	if (undoingIsLegal && (enginegame.isItOurTurn() || gamefileutility.isGameOver(gamefile)) && gamefile.moves.length > 0) { // > 0 catches scenarios where stalemate occurs on the first move
		setUndoingIsLegal(false);

		// Terminate all current animations to avoid a crash when undoing moves
		animation.clearAnimations();

		// go to latest move before undoing moves
		movesequence.viewFront(gamefile);

		// If it's their turn, only rewind one move.
		if (enginegame.isItOurTurn() && gamefile.moves.length > 1) movesequence.rewindMove(gamefile);
		movesequence.rewindMove(gamefile);
		selection.reselectPiece();
	}
}

function restartGame() {
	if (!inCheckmatePractice) return console.error("Restarting games is currently not supported for non-practice mode games");
	
	gameloader.unloadGame(); // Unload current game
	startCheckmatePractice(guipractice.getCheckmateSelectedID());
}


// Exports ------------------------------------------------------------------------------


export default {
	validCheckmates,
	areInCheckmatePractice,
	startCheckmatePractice,
	onGameUnload,
	getCompletedCheckmates,
	onEngineGameConclude,
	eraseCheckmatePracticeProgress,
	registerHumanMove,
	registerEngineMove
};