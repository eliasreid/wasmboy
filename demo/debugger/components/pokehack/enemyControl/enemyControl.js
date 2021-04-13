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
  //After the mon is chosen, and before the pokemon's data is loaded from
  // enemy party ROM into RAM
  WAIT_FOR_MON_LOAD: 3,
  //After pokemon is loaded, and we know what options are available.
  //Don't yet have a breakpoint figured out for this
  //Choosing before player makes choise is simpler I think
  CHOOSE_ACTION: 4
});

//TODO: default state should be overworld.
let battleState = BattleStates.BATTLE_START;

let unsubWasmboyFunc = false;
let unsubLoading = false;
let wasmboyReady = false;

const LoadSwitchMonAddress = 0x53e0;
//for now, just moves done loading, I think need to move forward to get pp, stats, etc.
const FinishedLoadingEnemyMonAddrress = 0x6966;

export default class EnemyControl extends Component {
  constructor() {
    super();

    this.state.wasmboy = {};
    this.state.loading = {};
    this.state.moveStrings = ['', '', '', ''];
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

      //enter this state checking whenever wasmboy gets new udpate
      //udpate states when breakpoints are hit
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

            //for now, rely on button press changeSwitchMon to get out of this state

            // if (!newState.pausedOnBreakpoint) {
            //   battleState = BattleStates.WAIT_FOR_MON_LOAD;
            //   //set breakpoint to
            // }

            break;
          case BattleStates.WAIT_FOR_MON_LOAD:
            if (newState.pausedOnBreakpoint) {
              //TODO: is wait for turn well-defined enough? Could be waiting for
              // For now, only handling pokemon switches anyways

              //Should have enough information to allow enemey to choose action
              // - read memory for move data and stuff
              // - Then when finished reading memory, play emulation again

              //Should only do this read once..
              console.log('paused on mon load breakpoint, starting promise chain');
              const gbMemoryStartPromise = WasmBoy._getWasmConstant('DEBUG_GAMEBOY_MEMORY_LOCATION');

              const movesReadPromise = gbMemoryStartPromise.then(gbMemoryStart => {
                //read gb memory
                console.log('got mem location, reading moves data');
                const movesStart = gbMemoryStart + 0xd0f1;
                const gbMemory = WasmBoy._getWasmMemorySection(movesStart, movesStart + 4);
                return gbMemory;
              });

              movesReadPromise.then(gbMemory => {
                //Managed to read data - got 0x21, 0x51, 0, 0
                //Which is tackle and stringshot!

                console.log('Moves data read');
                for (let i = 0; i < 4; i++) {
                  if (gbMemory[i] !== 0) {
                    this.state.moveStrings[i] = '0x' + gbMemory[i].toString(16);
                  } else {
                    this.state.moveStrings[i] = '';
                  }
                }

                WasmBoy.play().then(console.log('started playback again, enemy poke data loaded'));
                battleState = BattleStates.CHOOSE_ACTION;
              });
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

  changeSwitchMon(monIndex) {
    //How to call async function
    console.log('setting incoming enemy mon to %d', monIndex);

    //Need to understand, when to these "_runWasmExport" functions actually get called?
    let set_reg_promise = async () => {
      await WasmBoy._runWasmExport('setRegisterB', [monIndex]);
    };
    WasmBoy._runWasmExport('setRegisterB', [monIndex]).then(result => {
      console.log('Enemy switch move set to index %1, changing to wait for mon load state', monIndex);
      //unpause playback
      battleState = BattleStates.WAIT_FOR_MON_LOAD;

      WasmBoy._runWasmExport('setProgramCounterBreakpoint', [FinishedLoadingEnemyMonAddrress]).then(res => {
        console.log('set breakpoint for enemy mon load, continuing playback');
        WasmBoy.play().then(console.log('started playback again, waiting for pokemon to load to gather move data'));
      });
    });
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
          <button onClick={() => this.useMove(0)} disabled={battleState != BattleStates.CHOOSE_ACTION}>
            {this.state.moveStrings[0]}
          </button>
          <button onClick={() => this.useMove(1)} disabled={battleState != BattleStates.CHOOSE_ACTION}>
            {this.state.moveStrings[1]}
          </button>
          <button onClick={() => this.useMove(2)} disabled={battleState != BattleStates.CHOOSE_ACTION}>
            {this.state.moveStrings[2]}
          </button>
          <button onClick={() => this.useMove(3)} disabled={battleState != BattleStates.CHOOSE_ACTION}>
            {this.state.moveStrings[3]}
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
