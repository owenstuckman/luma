<script>
    export let message = "This is a warning!";
  </script>
  
  <style>
    .warning-box {
      display: flex;
      align-items: center;
      background-color: #fff3cd;
      color: #856404;
      padding: 10px;
      border-radius: 5px;
      border: 1px solid #ffeeba;
      margin: 10px 0;
    }
  
    .warning-icon {
      margin-right: 10px;
      font-size: 1.5em;
    }
  </style>
  
  <div class="warning-box">
    <span class="warning-icon">⚠️</span>
    <span>{message}</span>
  </div>