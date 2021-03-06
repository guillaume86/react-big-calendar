import React, { Component } from 'react';
import cn from 'classnames';
import { findDOMNode } from 'react-dom';
import dates from './utils/dates';
import localizer from './localizer'

import DayColumn from './DayColumn';
import EventRow from './MonthEventRow';
import TimeColumn from './TimeColumn';
import BackgroundCells from './MonthBackgroundCells';
import Header from './Header';

import getWidth from 'dom-helpers/query/width';
import scrollbarSize from 'dom-helpers/util/scrollbarSize';
import message from './utils/messages';

import { dateFormat} from './utils/propTypes';

import { notify } from './utils/helpers';
import { navigate } from './utils/constants';
import { accessor as get } from './utils/accessors';

import {
  inRange, eventSegments, endOfRange
  , eventLevels, sortEvents, segStyle, colStyle } from './utils/eventLevels';

const MIN_ROWS = 2;


export default class TimeGrid extends Component {

  static propTypes = {
    ...DayColumn.propTypes,
    ...TimeColumn.propTypes,

    step: React.PropTypes.number,
    min: React.PropTypes.instanceOf(Date),
    max: React.PropTypes.instanceOf(Date),
    scrollToTime: React.PropTypes.instanceOf(Date),
    dayFormat: dateFormat,
    rtl: React.PropTypes.bool
  }

  static defaultProps = {
    ...DayColumn.defaultProps,
    ...TimeColumn.defaultProps,

    step: 30,
    min: dates.startOf(new Date(), 'day'),
    max: dates.endOf(new Date(), 'day'),
    scrollToTime: dates.startOf(new Date(), 'day'),
    /* these 2 are needed to satisfy requirements from TimeColumn required props
     * There is a strange bug in React, using ...TimeColumn.defaultProps causes weird crashes
     */
    type: 'gutter',
    now: new Date()
  }

  constructor(props) {
    super(props)
    this.state = { gutterWidth: undefined, isOverflowing: null };
    this._selectEvent = this._selectEvent.bind(this)
    this._headerClick = this._headerClick.bind(this)
  }

  componentWillMount() {
    this._gutters = [];
    this.calculateScroll();
  }

  componentDidMount() {
    this.checkOverflow();

    if (this.props.width == null) {
      this.measureGutter()
    }
    this.applyScroll();

    this.positionTimeIndicator();
    this.triggerTimeIndicatorUpdate();
  }

  componentWillUnmount() {
    window.clearTimeout(this._timeIndicatorTimeout);
  }

  componentDidUpdate() {
    if (this.props.width == null && !this.state.gutterWidth) {
      this.measureGutter()
    }

    this.applyScroll();
    this.positionTimeIndicator();
    //this.checkOverflow()
  }

  componentWillReceiveProps(nextProps) {
    const { start, scrollToTime } = this.props;
    // When paginating, reset scroll
    if (!dates.eq(nextProps.start, start) || nextProps.scrollToTime !== scrollToTime) {
      this.calculateScroll();
    }
  }

  render() {
    let {
        events, start, end, width
      , startAccessor, endAccessor, allDayAccessor } = this.props;

    // TODO!!!!!!!!!!
    width = 100;//width || this.state.gutterWidth;

    let range = dates.range(start, end, 'day')

    this._slots = range.length;

    let allDayEvents = []
      , rangeEvents = [];

    events.forEach(event => {
      if (inRange(event, start, end, this.props)) {
        let eStart = get(event, startAccessor)
          , eEnd = get(event, endAccessor);

        if (
          get(event, allDayAccessor)
          || !dates.eq(eStart, eEnd, 'day')
          || (dates.isJustDate(eStart) && dates.isJustDate(eEnd)))
        {
          allDayEvents.push(event)
        }
        else
          rangeEvents.push(event)
      }
    })

    allDayEvents.sort((a, b) => sortEvents(a, b, this.props))

    let {first, last} = endOfRange(range);

    let segments = allDayEvents.map(evt => eventSegments(evt, first, last, this.props))

    let gutterRef = ref => this._gutters[1] = ref && findDOMNode(ref);

    return (
      <div className='rbc-time-view'>
        {
          this.renderHeader(range, segments, width)
        }
        <div 
          ref='content' 
          className='rbc-time-content' 
          style={{ height: 450 }}
        >
          <div ref='timeIndicator' className='rbc-current-time-indicator'></div>
          <TimeColumn
            {...this.props}
            showLabels
            style={{ width, float: 'left' }}
            ref={gutterRef}
            className='rbc-time-gutter'
          />
          <div style={{ marginLeft: width }}>
            <table>
              <tbody>
                <tr>
                  { 
                    this.renderEvents(range, rangeEvents, this.props.now)
                  }
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  renderEvents(range, events, today){
    let { min, max, endAccessor, startAccessor, components } = this.props;

    return range.map((date, idx) => {
      let daysEvents = events.filter(
        event => dates.inRange(date,
          get(event, startAccessor),
          get(event, endAccessor), 'day')
      )

      return (
        <td 
          key={idx}
          className="rbc-time-column-cell" 
          style={{ verticalAlign: 'top' }}
        >
          <DayColumn
            {...this.props }
            min={dates.merge(date, min)}
            max={dates.merge(date, max)}
            eventComponent={components.event}
            className={cn({ 'rbc-now': dates.eq(date, today, 'day') })}
            date={date}
            events={daysEvents}
          />
        </td>
      )
    })
  }

  renderAllDayEvents(range, levels){
    let { first, last } = endOfRange(range);

    while (levels.length < MIN_ROWS )
      levels.push([])

    return levels.map((segs, idx) =>
      <EventRow
        eventComponent={this.props.components.event}
        titleAccessor={this.props.titleAccessor}
        startAccessor={this.props.startAccessor}
        endAccessor={this.props.endAccessor}
        allDayAccessor={this.props.allDayAccessor}
        eventPropGetter={this.props.eventPropGetter}
        selected={this.props.selected}
        onSelect={this._selectEvent}
        slots={this._slots}
        key={idx}
        segments={segs}
        start={first}
        end={last}
      />
    )
  }

  renderHeader(range, segments, width) {
    let { messages, rtl, onSelectSlot } = this.props;
    let { isOverflowing } = this.state || {};

    let { levels } = eventLevels(segments);
    let style = {};

    if (isOverflowing)
      style[rtl ? 'marginLeft' : 'marginRight'] = scrollbarSize() + 'px';

    function handleSelectSlot({ start, end }) {
      let slots = range.slice(start, end + 1)
      notify(onSelectSlot, {
        slots,
        start: slots[0],
        end: slots[slots.length - 1]
      })
    }

    return (
      <div
        ref='headerCell'
        className={cn(
          'rbc-time-header',
          isOverflowing && 'rbc-overflowing'
        )}
        style={style}
      >
        <table>
          <thead>
            <tr className="rbc-row">
              <th
                className='rbc-label rbc-header-gutter'
                style={{ width }}
              />
              { this.renderHeaderCells(range) }
            </tr>
          </thead>
        </table>
        <table className="rbc-allday-container">
          <tbody>
            <tr className="rbc-row">
              <td
                ref={ref => this._gutters[0] = ref}
                className='rbc-label rbc-header-gutter rbc-header-gutter-text'
                style={{ width }}
              >
                { message(messages).allDay }
              </td>
              <td ref='allDay' className="rbc-allday-cell">
                <table 
                  className="rbc-table-bg" 
                  style={{ position: 'absolute', height: levels.length*25 }}
                >
                  <tbody> 
                    <BackgroundCells
                      rtl={this.props.rtl}
                      slots={range}
                      container={()=> this.refs.allDay}
                      selectable={this.props.selectable}
                      onSelectSlot={handleSelectSlot}
                    />
                  </tbody>
                </table>
                <table style={{ position: 'relative' }}>
                  <tbody>
                    <tr>
                      <td colSpan={range.length}></td>
                    </tr>
                    { this.renderAllDayEvents(range, levels) }
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  renderHeaderCells(range){
    let { dayFormat, culture, components } = this.props;
    let HeaderComponent = components.header || Header

    return range.map((date, i) =>
      <th
        key={i}
        className={cn('rbc-header', { 'rbc-today': dates.isToday(date) })}
      >
        <a href='#' onClick={this._headerClick.bind(null, date)}>
          <HeaderComponent
            date={date}
            label={localizer.format(date, dayFormat, culture)}
            localizer={localizer}
            format={dayFormat}
            culture={culture} />
        </a>
      </th>
    )
  }

  _headerClick(date, e){
    e.preventDefault()
    notify(this.props.onNavigate, [navigate.DATE, date])
  }

  _selectEvent(...args){
    notify(this.props.onSelectEvent, args)
  }

  measureGutter() {
    let width = this.state.gutterWidth;
    let gutterCells = this._gutters;

    if (!width) {
      width = Math.max(...gutterCells.map(getWidth));

      if (width) {
        this.setState({ gutterWidth: width })
      }
    }
  }

  applyScroll() {
    if (this._scrollRatio) {
      const { content } = this.refs;
      content.scrollTop = content.scrollHeight * this._scrollRatio;
      // Only do this once
      this._scrollRatio = null;
    }
  }

  calculateScroll() {
    const { min, max, scrollToTime } = this.props;

    const diffMillis = scrollToTime - dates.startOf(scrollToTime, 'day');
    const totalMillis = dates.diff(max, min);

    this._scrollRatio = diffMillis / totalMillis;
  }

  checkOverflow() {
    if (this._updatingOverflow) return;

    let isOverflowing = this.refs.content.scrollHeight > this.refs.content.clientHeight;

    if (this.state.isOverflowing !== isOverflowing) {
      this._updatingOverflow = true;
      this.setState({ isOverflowing }, () => {
        this._updatingOverflow = false;
      })
    }
  }

  positionTimeIndicator() {
    const {min, max} = this.props
    const now = new Date();

    const secondsGrid = dates.diff(max, min, 'seconds');
    const secondsPassed = dates.diff(now, min, 'seconds');

    const timeIndicator = this.refs.timeIndicator;
    const factor = secondsPassed / secondsGrid;
    const timeGutter = this._gutters[this._gutters.length - 1];

    if (timeGutter && now >= min && now <= max) {
      const pixelHeight = timeGutter.offsetHeight;
      const offset = Math.floor(factor * pixelHeight);

      timeIndicator.style.display = 'block';
      timeIndicator.style.left = timeGutter.offsetWidth + 'px';
      timeIndicator.style.top = offset + 'px';
    } else {
      timeIndicator.style.display = 'none';
    }
  }

  triggerTimeIndicatorUpdate() {
    // Update the position of the time indicator every minute
    this._timeIndicatorTimeout = window.setTimeout(() => {
      this.positionTimeIndicator();

      this.triggerTimeIndicatorUpdate();
    }, 60000)
  }

}
