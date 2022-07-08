"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const wait_1 = require("../src/wait");
const process = __importStar(require("process"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const globals_1 = require("@jest/globals");
(0, globals_1.test)('throws invalid number', () => __awaiter(void 0, void 0, void 0, function* () {
    const input = parseInt('foo', 10);
    yield (0, globals_1.expect)((0, wait_1.wait)(input)).rejects.toThrow('milliseconds not a number');
}));
(0, globals_1.test)('wait 500 ms', () => __awaiter(void 0, void 0, void 0, function* () {
    const start = new Date();
    yield (0, wait_1.wait)(500);
    const end = new Date();
    var delta = Math.abs(end.getTime() - start.getTime());
    (0, globals_1.expect)(delta).toBeGreaterThan(450);
}));
// shows how the runner will run a javascript action with env / stdout protocol
(0, globals_1.test)('test runs', () => {
    process.env['INPUT_MILLISECONDS'] = '500';
    const np = process.execPath;
    const ip = path.join(__dirname, '..', 'lib', 'main.js');
    const options = {
        env: process.env
    };
    console.log(cp.execFileSync(np, [ip], options).toString());
});
