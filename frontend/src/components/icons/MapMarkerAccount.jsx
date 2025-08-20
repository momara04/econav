// src/components/icons/MapMarkerAccount.jsx

const MapMarkerAccount = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    {...props}
  >
    {/* outer pin shape */}
    <path
      fill={props.fill || "#3d8371"}
      stroke="#333"
      strokeWidth="1.5"
      fillRule="evenodd"
      d="M11.291 21.706L12 21l-.709.706zM12 21l.708.706a1 1 0 0 1-1.417 0l-.006-.007l-.017-.017l-.062-.063a47.708 47.708 0 0 1-1.04-1.106a49.562 49.562 0 0 1-2.456-2.908c-.892-1.15-1.804-2.45-2.497-3.734C4.535 12.612 4 11.248 4 10c0-4.539 3.592-8 8-8c4.408 0 8 3.461 8 8c0 1.248-.535 2.612-1.213 3.87c-.693 1.286-1.604 2.585-2.497 3.735a49.583 49.583 0 0 1-3.496 4.014l-.062.063l-.017.017l-.006.006L12 21z"
      clipRule="evenodd"
    />

    {/* head */}
    <circle
      cx="12"
      cy="8.5"
      r="2"
      fill="white"
      stroke="#333"
      strokeWidth="1.5"
    />

    {/* shoulders */}
    <path
      d="M8 13.5c0-1.1 2.67-2.05 4-2.05s4 .95 4 2.05c-.86 1.3-2.33 2.15-4 2.15s-3.14-.85-4-2.15z"
      fill="white"
      stroke="#333"
      strokeWidth="1.5"
    />
  </svg>
);

export default MapMarkerAccount;
