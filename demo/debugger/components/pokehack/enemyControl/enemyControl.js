// Compoonent that contains the canvas and the actual output
// of WasmBoy

import { h, Component } from 'preact';

import { Pubx } from 'pubx';
import { PUBX_KEYS } from '../../../pubx.config';

import { WasmBoy } from '../../../wasmboy';

import './enemyControl.css';

const BattleStates = Object.freeze({
  OVERWORLD: 0,
  BATTLE_START: 1,
  CHOOSE_MON: 2,
  //action could be switch, move, or item
  WAIT_FOR_TURN: 3,
  CHOOSE_ACTION: 4
});

//TODO: default state should be overworld.
let battleState = BattleStates.BATTLE_START;

let unsubWasmboyFunc = false;
let unsubLoading = false;
let wasmboyReady = false;

const LoadSwitchMonAddress = 0x53e0;

export default class EnemyControl extends Component {
  constructor() {
    super();

    // Exerytime WasmBoy gets updated, simply re-render

    // TODO: don't need now, but should eventually try greying out moves that aren't available
    // Only un-grey when they ARE available

    // Pubx.subscribe(PUBX_KEYS.WASMBOY, newState => this.setState(newState));

    this.state.wasmboy = {};
    this.state.loading = {};
  }

  componentDidMount() {
    unsubLoading = Pubx.subscribe(PUBX_KEYS.LOADING, newState => this.setState({ loading: newState }));
    unsubWasmboyFunc = Pubx.subscribe(PUBX_KEYS.WASMBOY, newState => {
      this.setState({
        ...this.state,
        wasmboy: newState
      });

      if (newState.ready && !wasmboyReady) {
        wasmboyReady = true;
        //Set breakpoint to start out
        WasmBoy._runWasmExport('setProgramCounterBreakpoint', [LoadSwitchMonAddress]).then(res => {
          console.log('initial breakpoint set - for when enemy loads pokemon to switch to');
        });
      }

      if ('undefined' !== typeof newState.pausedOnBreakpoint) {
        switch (battleState) {
          case BattleStates.BATTLE_START:
            //For now, we're assuming this is start state, so breakpoint we're looking for brings us to
            // CHOOSE_MON
            if (newState.pausedOnBreakpoint) {
              //move into choose_mon state
              battleState = BattleStates.CHOOSE_MON;
            }
            break;
          case BattleStates.CHOOSE_MON:
            //wait for button press, if unpause breakpoint, then give up, move to next state
            if (!newState.pausedOnBreakpoint) {
              battleState = BattleStates.WAIT_FOR_TURN;
            }

            break;
          case BattleStates.WAIT_FOR_TURN:
            if (newState.pausedOnBreakpoint) {
              //TODO: is wait for turn well-defined enough? Could be waiting for
              // For now, only handling pokemon switches anyways
              battleState = BattleStates.CHOOSE_MON;
            }
            break;
          case BattleStates.CHOOSE_ACTION:
            break;
        }
      }
    });
    Pubx.get(PUBX_KEYS.WASMBOY).update();

    this.setState({
      ...this.state,
      loading: Pubx.get(PUBX_KEYS.LOADING),
      wasmboy: Pubx.get(PUBX_KEYS.WASMBOY)
    });
  }

  componentWillUnmount() {
    if (unsubLoading) {
      unsubLoading();
    }
    if (unsubWasmboyFunc) {
      unsubWasmboyFunc();
    }
  }

  useMove(moveIndex) {
    //TODO: write appropriate memory address?
    // IF button is enabled, then can assume it's safe to write to memory
    console.log('using move %d', moveIndex);
    //Call WASM function
  }

  //how to get callback when execute breakpoint is called

  //It's being done somewhere, where we say 'breakpoint' hit

  changeSwitchMon(monIndex) {
    //How to call async function
    console.log('setting incoming enemy mon to %d', monIndex);

    //Need to understand, when to these "_runWasmExport" functions actually get called?
    let set_reg_promise = async () => {
      await WasmBoy._runWasmExport('setRegisterB', [monIndex]);
    };
    WasmBoy._runWasmExport('setRegisterB', [monIndex]).then(result => {
      console.log('Enemy switch move set to index %1', monIndex);
      //TODO: unpause playback?
      WasmBoy.play().then(console.log('started playback again'));
      battleState = BattleStates.WAIT_FOR_TURN;
    });

    // console.log('reg b set executed', monIndex));
  }

  render() {
    const state_text = Object.keys(BattleStates)[battleState];
    const state_val = battleState;

    return (
      <div class="enemy-control">
        <h1>Enemy controller</h1>
        <div>
          <i>
            Current state: {state_text} val: {state_val}
          </i>
        </div>

        {/* <form onSubmit={this.onSubmit}>
        <input type="text" value={value} onInput={this.onInput} />
        <p>You typed this value: {value}</p>
        <button type="submit">Submit</button>
      </form> */}

        {/* Buttons to select pokemon move*/}
        <div class="enemy-control_moves">
          {/* <div class="enemy-control_moves" disabled={this.state.wasmboy.varthatdoesntexist}> */}
          <button onClick={() => this.useMove(0)} disabled={!this.state.wasmboy.loadedAndStarted}>
            Move 0
          </button>
          <button onClick={() => this.useMove(1)} disabled={!this.state.wasmboy.loadedAndStarted}>
            Move 1
          </button>
          <button onClick={() => this.useMove(2)} disabled={!this.state.wasmboy.loadedAndStarted}>
            Move 2
          </button>
          <button onClick={() => this.useMove(3)} disabled={!this.state.wasmboy.loadedAndStarted}>
            Move 3
          </button>
        </div>

        {/* TODO: update button text with names of pokemon */}

        {/* Buttons to select pokemon to switch to*/}
        <div class="enemy-control_switch">
          <button onClick={() => this.changeSwitchMon(0)} disabled={battleState != BattleStates.CHOOSE_MON}>
            Mon 0
          </button>
          <button onClick={() => this.changeSwitchMon(1)} disabled={battleState != BattleStates.CHOOSE_MON}>
            Mon 1
          </button>
          <button onClick={() => this.changeSwitchMon(2)} disabled={battleState != BattleStates.CHOOSE_MON}>
            Mon 2
          </button>
          <button onClick={() => this.changeSwitchMon(3)} disabled={battleState != BattleStates.CHOOSE_MON}>
            Mon 3
          </button>
          <button onClick={() => this.changeSwitchMon(4)} disabled={battleState != BattleStates.CHOOSE_MON}>
            Mon 4
          </button>
          <button onClick={() => this.changeSwitchMon(5)} disabled={battleState != BattleStates.CHOOSE_MON}>
            Mon 5
          </button>
        </div>
      </div>
    );
  }
}
