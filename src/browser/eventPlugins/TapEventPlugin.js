/**
 * Copyright 2013-2014 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @providesModule TapEventPlugin
 * @typechecks static-only
 */

"use strict";

//var DeviceLogger = window.global.DeviceLogger || window.console;
var EventConstants = require("EventConstants");
var EventPluginUtils = require("EventPluginUtils");
var EventPropagators = require("EventPropagators");
var SyntheticUIEvent = require("SyntheticUIEvent");
var TouchEventUtils = require("TouchEventUtils");
var ViewportMetrics = require("ViewportMetrics");

var keyOf = require("keyOf");
var topLevelTypes = EventConstants.topLevelTypes;

var isStartish = EventPluginUtils.isStartish;
var isEndish = EventPluginUtils.isEndish;

//TODO: Make thresholds configurable instead of constants
/**
 * Number of pixels that are tolerated in between a `touchStart` and `touchEnd`
 * in order to still be considered a 'tap' event.
 */
var tapMoveThreshold = 10;
var ignoreMouseThreshold = 350;
/**
 * Time tolerated in between a `touchStart` and `touchEnd`
 * in order to still be considered a `tap` event.
 */
var tapTimeThreshold = 2000;

var startCoords = {x: null, y: null};
var lastStartTouchEvent = null;
var lastEndTouchEvent = null;
var Axis = {
    x: {page: 'pageX', client: 'clientX', envScroll: 'currentPageScrollLeft'},
    y: {page: 'pageY', client: 'clientY', envScroll: 'currentPageScrollTop'}
};

var Time = {
    start : 0,
    end : 0
};

function getAxisCoordOfEvent(axis, nativeEvent) {
    var singleTouch = TouchEventUtils.extractSingleTouch(nativeEvent);
    if (singleTouch) {
        return singleTouch[axis.page];
    }
    return axis.page in nativeEvent ?
        nativeEvent[axis.page] :
        nativeEvent[axis.client] + ViewportMetrics[axis.envScroll];
}

function getDistance(coords, nativeEvent) {
    var pageX = getAxisCoordOfEvent(Axis.x, nativeEvent);
    var pageY = getAxisCoordOfEvent(Axis.y, nativeEvent);
    var distance = Math.pow(
        Math.pow(pageX - coords.x, 2) + Math.pow(pageY - coords.y, 2),
        0.5
    );
    //device-logger/DeviceLogger.error('distance ='+distance);
    return distance;
}

function getTime(nativeEvent) {
    return nativeEvent.timeStamp;
}

function getDuration() {
    var duration = Time.end - Time.start;
    //device-logger/DeviceLogger.error('duration ='+duration);
    return  duration;
}

function isTouchDevice() {
    return ('ontouchstart' in window);
}

var dependencies;
var mouseDependencies = [
    topLevelTypes.topMouseDown,
    topLevelTypes.topMouseMove,
    topLevelTypes.topMouseUp
];
var touchDependencies = [
    topLevelTypes.topTouchCancel,
    topLevelTypes.topTouchEnd,
    topLevelTypes.topTouchStart,
    topLevelTypes.topTouchMove
];

if (EventPluginUtils.useTouchEvents) {
    if(isTouchDevice()) {
        dependencies = touchDependencies;
    } else {
        dependencies = mouseDependencies;
    }
}


var eventTypes = {
    touchTap: {
        phasedRegistrationNames: {
            bubbled: keyOf({onTap: null}),
            captured: keyOf({onTapCapture: null})
        },
        dependencies: dependencies
    },
    touchTapStart: {
        phasedRegistrationNames: {
            bubbled: keyOf({onTapStart: null}),
            captured: keyOf({onTapStartCapture: null})
        },
        dependencies:dependencies
    },
    touchTapEnd: {
        phasedRegistrationNames: {
            bubbled: keyOf({onTapEnd: null}),
            captured: keyOf({onTapEndCapture: null})
        },
        dependencies:dependencies
    }
};

var TapEventPlugin = {

    tapMoveThreshold: tapMoveThreshold,

    ignoreMouseThreshold: ignoreMouseThreshold,

    eventTypes: eventTypes,

    /**
     * @param {string} topLevelType Record from `EventConstants`.
     * @param {DOMEventTarget} topLevelTarget The listening component root node.
     * @param {string} topLevelTargetID ID of `topLevelTarget`.
     * @param {object} nativeEvent Native browser event.
     * @return {*} An accumulation of synthetic events.
     * @see {EventPluginHub.extractEvents}
     */
    extractEvents: function(
        topLevelType,
        topLevelTarget,
        topLevelTargetID,
        nativeEvent) {

        //device-logger/DeviceLogger.error('event = %s topLevelType = %s', nativeEvent.type , topLevelType);
        var event = null;
        var distance;

        if (isStartish(topLevelType)) {
            if (lastStartTouchEvent && (nativeEvent.timeStamp - lastStartTouchEvent) < ignoreMouseThreshold) {
                return null;
            }
            lastStartTouchEvent = nativeEvent.timeStamp;
        } else if(isEndish(topLevelType)) {
            if (lastEndTouchEvent && (nativeEvent.timeStamp - lastEndTouchEvent) < ignoreMouseThreshold) {
                return null;
            }
            lastEndTouchEvent = nativeEvent.timeStamp;
        }

        // Dispatch event to onTapTouchEnd when tap gesture is cancelled by moving beyond threshold
        if (!isStartish(topLevelType) && !isEndish(topLevelType)) {
            if (startCoords.x && startCoords.y) {
                distance = getDistance(startCoords, nativeEvent);
                if (distance >= tapMoveThreshold) {
                    startCoords.x = 0;
                    startCoords.y = 0;
                    event = SyntheticUIEvent.getPooled(
                        eventTypes.touchTapEnd,
                        topLevelTargetID,
                        nativeEvent
                    );
                    EventPropagators.accumulateTwoPhaseDispatches(event);
                    return event;
                }
            }
            return null;
        }
        // Dispatch event to onTapTouchStart
        if (isStartish(topLevelType)) {
            // set start time
            Time.start = getTime(nativeEvent);
            //device-logger/DeviceLogger.error('setting start = %s' , Time.start);
            startCoords.x = getAxisCoordOfEvent(Axis.x, nativeEvent);
            startCoords.y = getAxisCoordOfEvent(Axis.y, nativeEvent);
            event = SyntheticUIEvent.getPooled(
                eventTypes.touchTapStart,
                topLevelTargetID,
                nativeEvent
            );
            EventPropagators.accumulateTwoPhaseDispatches(event);
            return event;
        }

        // Dispatch event to both onTapTouchEnd and onTapTouch
        if (isEndish(topLevelType)) {
            Time.end = getTime(nativeEvent);
            //device-logger/DeviceLogger.error('setting end = %s',Time.end);

            if (getDuration() > tapTimeThreshold) {
                //device-logger/DeviceLogger.error('ignore tap as time threshold exceeded');
                event = [
                    SyntheticUIEvent.getPooled(
                        eventTypes.touchTapEnd,
                        topLevelTargetID,
                        nativeEvent
                    )
                ];
            } else {
                distance = getDistance(startCoords, nativeEvent);
                event = [
                    SyntheticUIEvent.getPooled(
                        eventTypes.touchTapEnd,
                        topLevelTargetID,
                        nativeEvent
                    )];
                if (distance < tapMoveThreshold) {
                    event.push(
                        SyntheticUIEvent.getPooled(
                            eventTypes.touchTap,
                            topLevelTargetID,
                            nativeEvent
                        )
                    );
                } else {
                    /*jshint noempty:false*/
                    //device-logger/DeviceLogger.error('ignore tap as move threshold exceeded');
                }
            }
        }
        startCoords.x = 0;
        startCoords.y = 0;
        Time.start = 0;
        Time.end = 0;
        EventPropagators.accumulateTwoPhaseDispatches(event);
        return event;
    }

};

module.exports = TapEventPlugin;