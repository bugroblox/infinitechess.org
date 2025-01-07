
/**
 * This script controls the flashing of the tab name "YOUR MOVE"
 * when it is your turn and your in another tab.
 */

import moveutil from "../../../chess/util/moveutil.js";
import gameslot from "../../chess/gameslot.js";
import loadbalancer from "../loadbalancer.js";
import afk from "./afk.js";
import sound from "../sound.js";


/** The original tab title. We will always revert to this after temporarily changing the name name to alert player's it's their move. */
const originalDocumentTitle: string = document.title;

/** How rapidly the tab title should flash "YOUR MOVE" */
const periodicityMillis = 1500;

/** The ID of the timeout that can be used to cancel the timer that flips the tab title between "YOUR MOVE" and the default title. */
let timeoutID: ReturnType<typeof setTimeout> | undefined;

/** The ID of the timeout that can be used to cancel the timer that will play a move sound effect to help you realize it's your move. Typically about 20 seconds. */
let moveSound_timeoutID: ReturnType<typeof setTimeout> | undefined;



function onGameStart({ isOurMove }: { isOurMove: boolean }) {
	// This will already flash the tab name
	onMovePlayed({ isOpponents: isOurMove });
}

function onGameClose() {
	timeoutID = undefined;
}

function onMovePlayed({ isOpponents }: { isOpponents: boolean }) {
	if (!isOpponents) return;
	// Flash the tab name
	flashTabNameYOUR_MOVE(true);
	scheduleMoveSound_timeoutID();
}

/**
 * Toggles the document title showing "YOUR MOVE",
 * and sets a timer for the next toggle.
 * @param parity - If true, the tab name becomes "YOUR MOVE", otherwise it reverts to the original title
 */
function flashTabNameYOUR_MOVE(parity: boolean) {
	if (!loadbalancer.isPageHidden()) {
		// The page is no longer hidden, restore the tab's original title,
		// and stop flashing "YOUR MOVE"
		document.title = originalDocumentTitle;
	}

	document.title = parity ? "YOUR MOVE" : originalDocumentTitle;
	// Set a timer for the next toggle
	timeoutID = setTimeout(flashTabNameYOUR_MOVE, periodicityMillis, !parity);
}

function cancelFlashTabTimer() {
	document.title = originalDocumentTitle;
	clearTimeout(timeoutID);
	timeoutID = undefined;
}

function scheduleMoveSound_timeoutID() {
	if (!loadbalancer.isPageHidden()) return; // Don't schedule it if the page is already visible
	if (!moveutil.isGameResignable(gameslot.getGamefile()!)) return;
	const timeNextSoundFromNow = (afk.timeUntilAFKSecs * 1000) / 2;
	moveSound_timeoutID = setTimeout(sound.playSound_move, timeNextSoundFromNow, 0);
}

function cancelMoveSound() {
	clearTimeout(moveSound_timeoutID);
	moveSound_timeoutID = undefined;
}



export default {
	onGameStart,
	onGameClose,
	onMovePlayed,
};